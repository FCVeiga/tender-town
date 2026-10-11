"""
Feed writer — turns radar events into posts for the Tender Town home feed.

Events, each becoming one post:
  - a new active opportunity (tender, RFI, grant, signal)
  - a material update to a tracked opportunity (deadline moved, awarded)
  - a news story

The copy comes from the LLM (prompts/feed_post.md), fed only structured
facts so it can't invent details. Ranking mirrors webapp/lib/feed.ts:

    hot = score × 0.5^(age_days / HALF_LIFE_DAYS)

Because every post decays at the same rate, relative order only changes when
posts enter or leave — so each run snapshots ranks (rank / prev_rank) and the
site shows ▲/▼ against the previous run.
"""
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from urllib.parse import urlparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "database"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from models import ChangeEvent, Country, FeedPost, NewsItem, Opportunity  # noqa: E402
from services.llm_client import call_llm_json_premium, load_prompt  # noqa: E402

HALF_LIFE_DAYS = 4          # keep in sync with webapp/lib/feed.ts
UNSCORED = 30               # items whose score is unknown rank as "marginal"
UPDATE_WINDOW_DAYS = 14     # only recent changes become posts
SIGNAL_MAX_AGE_DAYS = 183   # keep in sync with webapp/lib/data.ts

CATEGORY_NAMES = {"rfp": "tender (RFP)", "rfi": "request for information / market consultation",
                  "grant": "grant / funding call", "signal": "procurement signal (announced, not open yet)"}
_PROMPT = None


def _naive(d):
    return d.replace(tzinfo=None) if d else None


def hot(score, posted_at, now):
    age_days = max(0.0, (now - _naive(posted_at)).total_seconds() / 86400) if posted_at else 0.0
    return (score if score is not None else UNSCORED) * 0.5 ** (age_days / HALF_LIFE_DAYS)


def is_active(o: Opportunity, now: datetime) -> bool:
    """Same rule as getActiveOpportunities() on the site."""
    if o.status not in ("OPEN", "SIGNAL"):
        return False
    if o.deadline and _naive(o.deadline) < now:
        return False
    if o.status == "SIGNAL" and not o.deadline and o.publication_date \
            and now - _naive(o.publication_date) > timedelta(days=SIGNAL_MAX_AGE_DAYS):
        return False
    return True


def _fmt(d):
    return _naive(d).strftime("%d %b %Y") if d else None


def _facts(lines: dict) -> str:
    return "\n".join(f"{k}: {v}" for k, v in lines.items() if v)


def _money(value, currency):
    return f"{currency or ''} {value:,.0f}".strip() if value else None


def opportunity_facts(o: Opportunity, country_names: dict) -> dict:
    return {
        "Category": CATEGORY_NAMES.get(o.opportunity_type, o.opportunity_type),
        "Original title": o.title,
        "Title": o.title_en if o.title_en and o.title_en != o.title else None,
        "Country": country_names.get(o.country, o.country),
        "Buyer": o.authority,
        "Deadline": _fmt(o.deadline),
        "Estimated value": _money(o.estimated_value, o.currency),
        "Contract duration": f"{o.duration_months} months" if o.duration_months else None,
        "Analyst summary": o.summary,
        "Source": urlparse(o.official_url or "").netloc,
    }


_ted = _tavily = None


def gather_material(url: str):
    """Source material for the writer, fetched in worker threads.
    Returns (extra facts, opportunity fields to backfill)."""
    global _ted, _tavily
    if not url:
        return {}, {}
    if "ted.europa.eu" in url:
        from adapters.ted import TedSearchProvider
        _ted = _ted or TedSearchProvider()
        d = _ted.notice_details(url.rstrip("/").split("/")[-1])
        facts = {
            "Estimated value": _money(d["value"], d["currency"]),
            "Contract duration": f"{d['duration_months']} months" if d["duration_months"] else None,
            "Contract nature": d["contract_nature"],
            "Notice descriptions (may include legal boilerplate)": "\n- " + "\n- ".join(d["details"]) if d["details"] else None,
        }
        backfill = {k: v for k, v in (("estimated_value", d["value"]), ("currency", d["currency"]),
                                      ("duration_months", d["duration_months"])) if v}
        return facts, backfill
    from agents.verification import fetch_page_text
    if _tavily is None and os.environ.get("TAVILY_API_KEY"):
        from adapters.tavily import TavilySearchProvider
        _tavily = TavilySearchProvider()
    return {"Source page text": fetch_page_text(url, _tavily)[:6000]}, {}


def write(event: str, facts: dict) -> dict:
    global _PROMPT
    if _PROMPT is None:
        _PROMPT = load_prompt("feed_post.md")
    out = call_llm_json_premium(_PROMPT, f"Event: {event}\n{_facts(facts)}")
    headline, body = (out.get("headline") or "").strip(), (out.get("body") or "").strip()
    if not headline:
        raise ValueError(f"empty headline: {out}")
    from services.facts import correct_known_facts
    return {"headline": correct_known_facts(headline)[:140], "body": correct_known_facts(body)[:400]}


def plain_copy(event: str, facts: dict) -> dict:
    """A post from the facts alone, for when the writer (LLM) is unavailable."""
    title = (facts.get("Title") or facts.get("Original title") or "").strip()
    if not title:
        return {}
    if event == "New opportunity":
        bits = [facts.get("Buyer"), facts.get("Estimated value"), f"deadline {facts['Deadline']}" if facts.get("Deadline") else None]
        body = facts.get("Analyst summary") or " · ".join(b for b in bits if b)
        return {"headline": title[:140], "body": (body or "")[:400]}
    if event.startswith("News"):
        return {"headline": title[:140], "body": (facts.get("Analyst summary") or facts.get("Excerpt") or "")[:400]}
    return {"headline": f"{event}: {title}"[:140], "body": (facts.get("What changed") or "")[:400]}


def plan_posts(session, now: datetime, rewrite: bool = False) -> list:
    """Events that should be posts but aren't yet — or, with rewrite=True,
    every current event, to regenerate copy. (post fields, event, facts, source url)."""
    # Plain posts (written without the LLM) count as missing, so they get proper copy once it's back.
    have = set() if rewrite else {pid for (pid,) in session.query(FeedPost.post_id).filter(FeedPost.plain.isnot(True))}
    country_names = {c.code: c.name for c in session.query(Country)}
    opps = {o.opportunity_id: o for o in session.query(Opportunity)}
    plans = []

    for o in opps.values():
        pid = f"opp:{o.opportunity_id}"
        if pid in have or not is_active(o, now):
            continue
        plans.append((dict(post_id=pid, kind="opportunity", event="new_opportunity",
                           opportunity_id=o.opportunity_id, category=o.opportunity_type,
                           country=o.country, score=o.opportunity_relevance_score,
                           posted_at=_naive(o.first_detected) or now),
                      "New opportunity", opportunity_facts(o, country_names), o.official_url))

    # Only the latest change per opportunity and kind: an older deadline move
    # that has since been superseded would just be stale news.
    since = now - timedelta(days=UPDATE_WINDOW_DAYS)
    latest = {}
    for c in (session.query(ChangeEvent).filter(ChangeEvent.detected_at >= since)
              .order_by(ChangeEvent.detected_at, ChangeEvent.id)):
        latest[(c.opportunity_id, c.event_type)] = c
    for c in latest.values():
        pid, o = f"chg:{c.id}", opps.get(c.opportunity_id)
        if pid in have or not o:
            continue
        desc = c.description or ""
        if c.event_type == "deadline" and is_active(o, now):
            event, label = "deadline_change", "Deadline change"
        elif c.event_type == "notice_update" and is_active(o, now):
            event, label = "notice_update", "Tender update (clarification / amended documents)"
        elif c.event_type == "status" and "award" in desc.lower():
            event, label = "awarded", "Contract awarded"
        else:
            continue  # e.g. a deadline simply passing isn't news
        facts = opportunity_facts(o, country_names) | {"What changed": desc,
                                                        "What the change notice says": c.note or c.note_source}
        plans.append((dict(post_id=pid, kind="opportunity", event=event, opportunity_id=o.opportunity_id,
                           change_event_id=c.id, category=o.opportunity_type, country=o.country,
                           score=o.opportunity_relevance_score, posted_at=_naive(c.detected_at)),
                      label, facts, o.official_url))

    for n in session.query(NewsItem):
        pid = f"news:{n.news_id}"
        if pid in have:
            continue
        plans.append((dict(post_id=pid, kind="news", event="news", news_id=n.news_id, category=n.category,
                           country=n.country, score=n.relevance_score,
                           posted_at=_naive(n.published_date) or _naive(n.created_at) or now),
                      f"News ({n.category})",
                      {"Original title": n.title, "Title": n.title_en, "Region": n.region, "Source": n.source_name,
                       "Published": _fmt(n.published_date), "Analyst summary": n.summary,
                       "Excerpt": (n.excerpt or "")[:400]}, n.source_url))
    return plans


def publish_new_posts(session, errors: list, now=None, rewrite: bool = False) -> int:
    """Write and store posts for every new event (failed ones retry next run).
    rewrite=True regenerates the copy of existing posts, keeping their ranks."""
    now = now or datetime.utcnow()
    plans = plan_posts(session, now, rewrite)
    # Plain posts are retried from their facts only: no page fetch (and search credit) every run.
    plain_ids = {pid for (pid,) in session.query(FeedPost.post_id).filter(FeedPost.plain.is_(True))}

    def run(plan):
        fields, event, facts, url = plan
        try:
            try:
                extra, backfill = ({}, {}) if fields["post_id"] in plain_ids else gather_material(url)
            except Exception:  # unreadable source: write from the facts we have
                extra, backfill = {}, {}
            return fields, write(event, facts | {k: v for k, v in extra.items() if v}), backfill, None
        except Exception as e:
            copy = plain_copy(event, facts)
            return (fields, copy | {"plain": True}, {}, None) if copy else (fields, None, {}, e)

    published = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        for fields, copy, backfill, err in pool.map(run, plans):
            if err or not copy:
                if err:
                    errors.append(f"feed post {fields['post_id']}: {err}")
                continue
            from services.facts import correct_known_facts
            copy["headline"] = correct_known_facts(copy.get("headline") or "")[:140]
            copy["body"] = correct_known_facts(copy.get("body") or "")[:400]
            if backfill and fields.get("opportunity_id"):
                o = session.get(Opportunity, fields["opportunity_id"])
                for k, v in backfill.items():
                    if getattr(o, k) is None:
                        setattr(o, k, v)
            existing = session.get(FeedPost, fields["post_id"])
            copy.setdefault("plain", False)
            if existing:
                existing.headline, existing.body, existing.plain = copy["headline"], copy["body"], copy["plain"]
            else:
                session.add(FeedPost(**fields, **copy, created_at=now))
            session.commit()
            published += 1
    return published


def visible(p: FeedPost, opps: dict, now: datetime) -> bool:
    if p.kind == "news" or p.event == "awarded":
        return True  # notice_update / deadline_change posts follow their opportunity's status
    o = opps.get(p.opportunity_id)
    return bool(o) and is_active(o, now)


def rank_posts(session, now=None) -> int:
    """Refresh scores from their sources, rank visible posts by hot, and keep
    the previous rank so the site can show movement."""
    now = now or datetime.utcnow()
    opps = {o.opportunity_id: o for o in session.query(Opportunity)}
    news = {n.news_id: n for n in session.query(NewsItem)}
    posts = session.query(FeedPost).all()
    for p in posts:
        if p.opportunity_id in opps:
            p.score = opps[p.opportunity_id].opportunity_relevance_score
        elif p.news_id in news:
            p.score = news[p.news_id].relevance_score
    shown = sorted((p for p in posts if visible(p, opps, now)), key=lambda p: hot(p.score, p.posted_at, now),
                   reverse=True)
    shown_ids = {p.post_id for p in shown}
    for i, p in enumerate(shown, 1):
        p.prev_rank, p.rank, p.ranked_at = p.rank, i, now
    for p in posts:
        if p.post_id not in shown_ids:
            p.prev_rank, p.rank = p.rank, None
    session.commit()
    return len(shown)
