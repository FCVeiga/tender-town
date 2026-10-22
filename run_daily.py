"""
Master Daily Workflow orchestrator (spec section 75).
Wires agents together: discovery -> triage -> promotion -> digest.

    python run_daily.py

Needs DATABASE_URL and ANTHROPIC_API_KEY. TAVILY_API_KEY is optional (web
search is skipped without it; TED is keyless). Tunables via env:
TAVILY_QUERIES_PER_RUN (default 20), MAX_TRIAGE_PER_RUN (default 400).
"""
import json
import os
import re
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, date, timedelta
from types import SimpleNamespace
from urllib.parse import urlparse

import yaml

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "database"))
sys.path.insert(0, os.path.dirname(__file__))

from database.models import (  # noqa: E402
    init_db, get_session, Source, Country, AgentRun, Candidate, Opportunity, NewsItem,
    ChangeEvent, ChangeImportance,
)
from agents.digest import render_daily_digest, CoverageStats  # noqa: E402
from agents.discovery import run_discovery, build_query_combinations  # noqa: E402
from agents.triage import (  # noqa: E402
    heuristic_prefilter, run_triage_llm, run_triage_copy, needs_public_copy, news_worth_showing, apply_triage_result,
)
from services.llm_client import take_cache_usage  # noqa: E402
from services.deduplicator import fingerprint, headline_key, procurement_score, same_story
from services.facts import correct_known_facts  # noqa: E402
from services import agent_settings as S  # noqa: E402
from sqlalchemy import text as sql_text  # noqa: E402
from agents.source_monitor import SITE_QUERY  # noqa: E402

CONFIG_DIR = os.path.join(os.path.dirname(__file__), "config")

# TED full-text search is phrase-matched and free, so it gets a fixed,
# high-precision list every day.
TED_PHRASES = [
    "EUDI Wallet", "European Digital Identity Wallet", "digital identity wallet", "EUDIW",
]

def _local_ted_phrases() -> list:
    """Wallet phrases in every EU language (config/languages.yaml): TED matches
    each notice in its own language, so English-only phrases miss most of them.
    The generic 'electronic identification' terms are left out on purpose —
    like bare 'eIDAS', they match e-signature boilerplate in unrelated notices."""
    with open(os.path.join(CONFIG_DIR, "languages.yaml")) as f:
        phrases = yaml.safe_load(f)["phrases"]
    return [p for lang, ps in phrases.items() if lang != "en" for p in ps[:1]]


TED_PHRASES = list(dict.fromkeys(TED_PHRASES + _local_ted_phrases()))

# Triage type -> opportunity category shown on the site (Opportunities subpages).
OPPORTUNITY_TYPES = {
    "TENDER": "rfp", "RFI": "rfi", "GRANT": "grant", "CONSORTIUM_CALL": "grant",
    "PILOT": "grant", "PIPELINE_SIGNAL": "signal",
}
NEWS_CATEGORIES = ("regulation", "industry", "market")
PROMOTE_THRESHOLD = 50

# Tavily news-mode queries (last 30 days). Only candidates from this pack are
# eligible for the News page — general web results for NEWS_ONLY are mostly
# vendor product pages. Triage relevance is bid-oriented. A story is kept when
# relevance is above 0 and importance is above the market-note floor.
NEWS_QUERIES = [
    "EUDI Wallet rollout",
    "European Digital Identity Wallet certification",
    "national EUDI wallet procurement",
    "EUDI Wallet relying party",
]


def rotate(queries: list, n: int) -> list:
    """n of the queries, a different slice each day."""
    if not queries or n <= 0:
        return []
    start = (date.today().toordinal() * n) % len(queries)
    return [queries[(start + i) % len(queries)] for i in range(min(n, len(queries)))]


def tavily_queries_for_today(n: int) -> list:
    """All keyword-pack queries, rotated so each day covers a different slice
    (keeps Tavily usage to n credits/day while cycling the full set)."""
    with open(os.path.join(CONFIG_DIR, "keywords.yaml")) as f:
        packs = yaml.safe_load(f)
    queries = []
    for name, pack in packs.items():
        if not name.startswith("pack_"):
            continue
        if pack.get("combine_with"):
            queries += build_query_combinations(pack)
        else:
            # Bare terms like "PID" or "mDL" are meaningless on the open web.
            queries += [f"{t} government procurement" for t in pack["terms"]]
    if not queries or n <= 0:
        return []
    start = (date.today().toordinal() * n) % len(queries)
    return [queries[(start + i) % len(queries)] for i in range(min(n, len(queries)))]


def _parse_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d")
    except ValueError:
        return None


def ted_meta(candidate: Candidate) -> dict:
    """Fields the TED adapter writes into the snippet: notice type, procedure
    id (shared by every notice of one procurement) and tender deadline."""
    if "ted.europa.eu" not in (candidate.source_url or ""):
        return {}
    text = candidate.description or ""
    grab = lambda pat: (m.group(1) if (m := re.search(pat, text)) else None)
    return {
        "notice_type": grab(r"Notice type: ([a-z0-9-]+)"),
        "procedure": grab(r"TED procedure: ([0-9a-f-]{36})"),
        "deadline": _parse_date(grab(r"Tender deadline: (\d{4}-\d{2}-\d{2})")),
    }


def ted_notice_order(url: str):
    """TED publication numbers ("671205-2026") increase over time: (year, n)."""
    m = re.search(r"/(\d+)-(\d{4})$", url or "")
    return (int(m.group(2)), int(m.group(1))) if m else None


def ted_notice_type(candidate: Candidate):
    return ted_meta(candidate).get("notice_type")


def _fmt(d):
    return d.strftime("%d %b %Y") if d else "none"


def record_changes(session, opp: Opportunity, new: dict, now: datetime,
                   notice_url: str = None, note: str = None) -> list:
    """Diff an existing opportunity against incoming values; log each material
    change as a ChangeEvent so the site can show what moved. notice_url / note
    carry what the change notice itself says (see agents/updates.py)."""
    events = []
    old_dl = opp.deadline.replace(tzinfo=None) if opp.deadline else None
    new_dl = new.get("deadline")
    if new_dl and old_dl != new_dl:
        verb = "extended" if old_dl and new_dl > old_dl else "brought forward" if old_dl else "set"
        events.append(("deadline", f"Deadline {verb}: {_fmt(old_dl)} → {_fmt(new_dl)}"))
    finished = ("AWARDED", "CLOSED")
    newly_finished = new.get("status") in finished and opp.status != new.get("status")
    reopened = opp.status in finished and new.get("status") == "OPEN"
    if newly_finished or reopened:
        events.append(("status", f"Status changed: {opp.status} → {new['status']}"))
    for event_type, description in events:
        session.add(ChangeEvent(opportunity_id=opp.opportunity_id, event_type=event_type,
                                importance=ChangeImportance.MATERIAL, description=description,
                                detected_at=now, notice_url=notice_url, note_source=note))
    return [d for _, d in events]


def classify_opportunity(candidate: Candidate, t: dict):
    """(category, awarded) — TED's notice type overrides the LLM when present:
    cn-* and pin-cfc-* (PIN used as the call itself) = RFP; pmc = market
    consultation (RFI); other pin-* = prior information notice, i.e. a planned
    procurement (signal); can-*/veat = award (already awarded, never active)."""
    category = OPPORTUNITY_TYPES.get((t.get("type") or "").upper())
    nt = ted_notice_type(candidate)
    if nt:
        if nt.startswith(("can-", "veat")):
            return category or "rfp", True
        if nt.startswith(("cn-", "pin-cfc")):
            return "rfp", False
        if nt == "pmc":
            return "rfi", False
        if nt.startswith("pin-"):
            return "signal", False
    return category, False


def apply_language_change(session) -> bool:
    """When the Translator Agent's target language changed since the last run,
    queue what agents wrote in the old one: tender analyses re-run, news reports
    regenerate when opened, feed posts are rewritten (the translator re-does
    titles, names, summaries and notes by itself, from their language markers)."""
    from sqlalchemy import text as sql
    name, code = S.target_language()
    row = session.execute(sql("select value from app_settings where key = 'language'")).first()
    applied = (row.value or {}).get("applied") if row else "en"
    if applied == code:
        return False
    session.execute(sql("update opportunities set tender_analysed_at = null where status in ('OPEN','SIGNAL','UNVERIFIED')"))
    session.execute(sql("update news_items set summary_long = null, key_facts = null, analysis = null, analysed_at = null"))
    session.execute(sql("update scope_news_reports set analysis = null, analysed_at = null"))
    session.execute(sql("insert into app_settings (key, value) values ('language', cast(:v as jsonb)) "
                        "on conflict (key) do update set value = excluded.value, updated_at = now()"),
                    {"v": json.dumps({"applied": code, "name": name})})
    session.commit()
    print(f"Language: {applied} -> {code} ({name}); analyses, news reports and feed posts will be redone")
    return True


def _written_lang(fields: dict) -> dict:
    """{column: platform language} for the columns triage filled."""
    code = S.target_language()[1]
    return {k: code for k, v in fields.items() if v}


def _add_source(session, item_type: str, item_id: str, url: str, title: str, published):
    """Remember another outlet that covered a record we already keep."""
    if not url or not item_id:
        return
    session.execute(sql_text("""
        insert into item_sources (item_type, item_id, url, title, source_name, published_at)
        values (:t, :i, :u, :title, :name, :pub)
        on conflict (item_type, item_id, url) do nothing
    """), {
        "t": item_type, "i": item_id, "u": url[:1024],
        "title": ((title or "")[:500] or None),
        "name": (urlparse(url).netloc.replace("www.", "")[:200] or None),
        "pub": published,
    })


def _best_procurement(session, country, title, reference):
    """The purchase this title is about, when one candidate is clearly closer than the rest."""
    if not country or not title:
        return None
    best, best_score, second = None, 0.0, 0.0
    rows = session.query(Opportunity).filter(
        Opportunity.country == country, Opportunity.status != "REJECTED").all()
    for opp in rows:
        score = max(
            procurement_score(title, opp.title_en or "", reference, opp.reference),
            procurement_score(title, opp.title or "", reference, opp.reference),
        )
        if score > best_score:
            second, best, best_score = best_score, opp, score
        elif score > second:
            second = score
    if best and best_score - second >= 0.08:
        return best
    return None


def _best_story(session, title, published):
    """An article from the last 60 days that is the same event, not a new one."""
    if not title:
        return None
    since = (published or datetime.utcnow()) - timedelta(days=60)
    rows = session.query(NewsItem).filter(
        (NewsItem.published_date >= since) | (NewsItem.created_at >= since)).all()
    best, best_score = None, 0.0
    want = headline_key(title)
    for item in rows:
        other = item.title_en or item.title or ""
        if not same_story(title, other):
            continue
        score = 1.0 if headline_key(other) == want else 0.7
        if "january 2026" in (item.title or "").lower() or "january 2026" in (item.title_en or "").lower():
            score -= 0.2
        if score > best_score:
            best, best_score = item, score
    return best


def _correct_item(item, *attrs):
    for attr in attrs:
        current = getattr(item, attr, None)
        if not current:
            continue
        fixed = correct_known_facts(current)
        if fixed != current:
            setattr(item, attr, fixed)


def promote(session, candidate: Candidate, t: dict, country_names: dict):
    """Turn a triaged candidate into an Opportunity or NewsItem row.
    Returns ("opportunity"|"news", row), ("updated", opp, [change, ...]) or None."""
    ctype = (t.get("type") or "").upper()
    relevance = int(t.get("relevance") or 0)
    country = (t.get("country") or "").upper()[:2] or None
    from services.publication import neutralize, publish_reason
    summary = neutralize(correct_known_facts(t.get("summary") or ""))
    interpretation = publish_reason(summary, t.get("reason") or "")

    category, awarded = classify_opportunity(candidate, t)
    if category and relevance >= PROMOTE_THRESHOLD:
        now = datetime.utcnow()
        ted = ted_meta(candidate)
        # Only TED's structured deadline is trusted at this point. Anything else
        # starts UNVERIFIED and is settled by verify_opportunities() against
        # the source page (triage only saw a snippet and doesn't know the date).
        deadline = None if awarded else ted.get("deadline")
        if awarded:
            status = "AWARDED"
        elif deadline:
            status = "OPEN" if deadline >= now else "CLOSED"
        else:
            status, deadline = "UNVERIFIED", _parse_date(t.get("deadline"))
        reference = f"TED:{ted['procedure']}" if ted.get("procedure") else None
        # A news story is not a tender. Without the notice, or the documents
        # that state the requirements, the most it can be is a signal.
        from agents.official_notice import is_official_call
        if category in ("rfp", "rfi", "grant") and not is_official_call(candidate.source_url, reference):
            category = "signal"
            if status == "OPEN":
                status = "SIGNAL"
        fields = dict(
            title=candidate.title or "(untitled)", country=country,
            title_en=(correct_known_facts(t.get("title_en") or "") or None), language=(t.get("language") or None),
            authority=(t.get("authority") or None), opportunity_type=category,
            authority_en=(t.get("authority") or None),  # triage already adds the English rendering
            status=status, summary=summary, deadline=deadline,
            publication_date=_parse_date(candidate.publication_date),
            official_url=candidate.source_url, last_checked=now,
            relevance_score=relevance, opportunity_relevance_score=relevance,
            # Triage writes these in the platform language (Translator Agent's target).
            lang=_written_lang({"title_en": t.get("title_en"), "authority_en": t.get("authority"), "summary": summary}),
        )
        if awarded:
            fields["status_evidence"] = "The contract award notice is published."
        if reference:
            fields["reference"] = reference

        # Is this an update of something we already track? TED republishes a
        # procurement as a new notice for every change (deadline extensions,
        # corrigenda), all sharing one procedure id. Fall back to the same
        # notice URL (re-triage), then same TED title + country.
        q = session.query(Opportunity)
        existing = (q.filter_by(reference=reference).first() if reference else None) \
            or (q.filter_by(official_url=candidate.source_url).first() if candidate.source_url else None)
        if not existing and ted:
            existing = q.filter(Opportunity.title == fields["title"], Opportunity.country == country,
                                Opportunity.official_url.like("%ted.europa.eu%")).first()
        opp_id = fingerprint(country or "", t.get("authority") or "", None, candidate.title or "")
        existing = existing or session.get(Opportunity, opp_id)
        if not existing:
            # A press article and the TED notice of one purchase, or two write-ups
            # of it. Different purchases in the same country stay separate.
            clustered = _best_procurement(session, country, t.get("title_en") or candidate.title, reference)
            if clustered and clustered.official_url != candidate.source_url:
                _add_source(session, "tender", clustered.opportunity_id, candidate.source_url,
                            t.get("title_en") or candidate.title, candidate.publication_date)
                incoming_ted = "ted.europa.eu" in (candidate.source_url or "")
                have_ted = "ted.europa.eu" in (clustered.official_url or "")
                if incoming_ted and not have_ted:
                    existing = clustered
                else:
                    _correct_item(clustered, "summary", "title_en")
                    return "unchanged", clustered

        if existing:
            held, incoming = ted_notice_order(existing.official_url), ted_notice_order(candidate.source_url)
            if held and incoming and incoming < held:
                existing.last_checked = now
                return "unchanged", existing  # an older notice of a procurement we hold a newer version of
            # publication_date = when the procurement first appeared (drives "New");
            # a later notice is an update, not a new opportunity.
            old_pub = existing.publication_date.replace(tzinfo=None) if existing.publication_date else None
            if old_pub and (not fields["publication_date"] or old_pub < fields["publication_date"]):
                fields["publication_date"] = old_pub
            if existing.verified_at and not awarded and not ted.get("deadline"):
                # Keep the status/deadline verification established; a snippet
                # re-triage is weaker evidence.
                fields.pop("status"); fields.pop("deadline")
            # A newer TED notice is a change notice: keep what it says changed.
            notice_note, notice_changes = None, None
            if ted and incoming and (not held or incoming > held):
                try:
                    from adapters.ted import TedSearchProvider
                    from agents.updates import note_source
                    notice_changes = TedSearchProvider().notice_changes(candidate.source_url.rstrip("/").split("/")[-1])
                    notice_note = note_source(notice_changes)
                except Exception:
                    pass
            changes = record_changes(session, existing, fields, now, candidate.source_url if notice_note else None, notice_note)
            if not changes and notice_note:
                # Clarifications, amended documents…: an update even without a new deadline.
                from agents.updates import fallback_description
                desc = fallback_description(notice_changes)
                session.add(ChangeEvent(opportunity_id=existing.opportunity_id, event_type="notice_update",
                                        importance=ChangeImportance.MATERIAL, description=desc, detected_at=now,
                                        notice_url=candidate.source_url, note_source=notice_note))
                changes = [desc]
            for k, v in fields.items():
                setattr(existing, k, v)
            if any(str(change).startswith("Deadline ") for change in changes) and existing.deadline:
                from agents.official_notice import align_submission_deadline
                for attr in ("summary", "tender_summary"):
                    current = getattr(existing, attr) or ""
                    fixed = align_submission_deadline(current, existing.deadline)
                    if fixed != current:
                        setattr(existing, attr, fixed)
                existing.tender_analysed_at = None
            if changes:
                existing.last_change = now
                return "updated", existing, changes
            return "unchanged", existing
        opp = Opportunity(opportunity_id=opp_id, first_detected=now, **fields)
        session.add(opp)
        return "opportunity", opp

    from_news_search = "news" in (candidate.potential_categories or [])
    if ctype == "NEWS_ONLY" and from_news_search and relevance > 0 and news_worth_showing(t):
        category = t.get("news_category") if t.get("news_category") in NEWS_CATEGORIES else "market"
        fields = dict(
            title=candidate.title or "(untitled)", category=category,
            title_en=(correct_known_facts(t.get("title_en") or "") or None), language=(t.get("language") or None),
            region=country_names.get(country, "EU / International") if country else "EU / International",
            country=country, published_date=_parse_date(candidate.publication_date) or candidate.discovered_at,
            source_name=urlparse(candidate.source_url or "").netloc,
            source_url=candidate.source_url,
            excerpt=(candidate.description or "")[:400], summary=summary,
            impact_note=interpretation,
            relevance_score=int(t.get("importance") or 0) or None,
            lang=_written_lang({"title_en": t.get("title_en"), "summary": summary}),
        )
        existing = session.get(NewsItem, candidate.candidate_id)
        if not existing:
            match = _best_story(session, t.get("title_en") or candidate.title, fields["published_date"])
            if match and match.source_url != candidate.source_url:
                _add_source(session, "news", match.news_id, candidate.source_url,
                            t.get("title_en") or candidate.title, fields["published_date"])
                _correct_item(match, "summary", "title_en", "title")
                return "unchanged_news", match
        if existing:  # re-triage (or another scope): refresh in place
            for k, v in fields.items():
                setattr(existing, k, v)
            return "unchanged_news", existing
        item = NewsItem(news_id=candidate.candidate_id, **fields)
        session.add(item)
        return "news", item
    return None


def verify_opportunities(session, errors: list) -> int:
    """Check every not-yet-settled opportunity against its source: TED XML
    for TED notices without a deadline, page text + LLM for everything else.
    Re-checks items without a firm deadline weekly, since pages change."""
    from adapters.ted import TedSearchProvider
    from agents import verification as V
    tavily = None
    if os.environ.get("TAVILY_API_KEY"):
        from adapters.tavily import TavilySearchProvider
        tavily = TavilySearchProvider()
    ted = TedSearchProvider()
    now = datetime.utcnow()
    stale = now - timedelta(days=V.REVERIFY_AFTER_DAYS)
    todo = (session.query(Opportunity)
            .filter(~Opportunity.status.in_(["CLOSED", "AWARDED", "REJECTED"]))
            .filter((Opportunity.verified_at.is_(None)) | (Opportunity.verified_at < stale))
            .all())
    checked = 0
    for o in todo:
        ted_ref = (o.reference or "").startswith("TED:")
        is_ted = "ted.europa.eu" in (o.official_url or "") or ted_ref
        if is_ted and o.deadline:
            continue  # the notice deadline already decides it
        try:
            if is_ted:
                publication = o.official_url.rstrip("/").split("/")[-1] if "ted.europa.eu" in (o.official_url or "") else None
                if not publication and ted_ref:
                    from agents.tender_documents import _procedure_notices
                    notices = _procedure_notices(o.reference[4:])
                    publication = notices[-1]["publication-number"] if notices else None
                status, deadline, evidence = V.verify_ted(ted, publication, o.opportunity_type, now)
                category = o.opportunity_type
            else:
                v = V.llm_verify(o.opportunity_type, o.title, V.fetch_page_text(o.official_url, tavily), now)
                status, deadline, dated, category = V.resolve(o.opportunity_type, v, now)
                evidence = (f'"{v["evidence"]}" — {v.get("reason") or ""}' if v.get("evidence")
                            else v.get("reason") or "No dates found on the source page")
                if dated and not o.publication_date:
                    o.publication_date = dated
        except Exception as e:
            errors.append(f"verify {o.opportunity_id}: {e}")
            status, deadline, category, evidence = "UNVERIFIED", None, o.opportunity_type, f"Source could not be read: {e}"[:300]
        incoming_deadline = None if status == "AWARDED" else deadline
        changes = record_changes(session, o, {"status": status, "deadline": incoming_deadline}, now) if o.verified_at else []
        o.status, o.opportunity_type, o.status_evidence, o.verified_at = status, category, evidence, now
        if status == "AWARDED":
            o.deadline = None
        elif deadline:
            o.deadline = deadline
        if changes:
            o.last_change = now
        session.commit()
        checked += 1
    return checked


def main():
    engine = init_db()
    session = get_session(engine)
    due, runs, reason = S.pipeline_due(session)
    if not due:
        print(f"Pipeline skipped ({reason}). The schedule stays every 4 hours so a paid plan can speed it up.")
        session.close()
        return None
    print(f"Pipeline running ({reason}).")
    errors = []

    # A bid deadline that has passed is a closed tender, on every market.
    session.execute(sql_text("""
        update opportunities set status = 'CLOSED'
        where status = 'OPEN' and deadline is not null and deadline < now()
    """))
    session.commit()

    run_id = f"RUN-{uuid.uuid4().hex[:10]}"
    agent_run = AgentRun(run_id=run_id, agent_name="daily_orchestrator",
                         started_at=datetime.utcnow(), status="RUNNING")
    session.add(agent_run)
    session.commit()

    countries = session.query(Country).all()
    country_codes = [c.code for c in countries]
    country_names = {c.code: c.name for c in countries}

    # Settings page: scopes (each with its search, triage and agents), platform agents.
    S.load(session, search_defaults={
        "topic": "EUDI Wallet", "ted_phrases": TED_PHRASES,
        "web_queries": tavily_queries_for_today(10_000), "news_queries": NEWS_QUERIES,
        "site_query": "EUDI eIDAS " + SITE_QUERY,
    })
    run_scopes = S.scopes()
    print(f"Scopes: {', '.join(s.name for s in run_scopes) or 'none — built-in defaults only'}")
    off = [a for a in S.PLATFORM_AGENTS if not S.enabled(a)]
    if off:
        print(f"Platform agents switched off on Settings: {', '.join(off)}")
    language_changed = apply_language_change(session)

    def link(cids, scope_ids):
        """Queue candidates for triage by these scopes (once per pair)."""
        for cid in cids:
            for sid in scope_ids:
                session.execute(sql_text("insert into candidate_scopes (candidate_id, scope_id) values (:c, cast(:s as uuid)) on conflict do nothing"),
                                {"c": cid, "s": sid})
        session.commit()

    # --- 1. Discovery (each scope's Search Agent) ----------------------------
    from adapters.ted import TedSearchProvider
    query_count = 0
    candidates = []
    tavily = None
    if os.environ.get("TAVILY_API_KEY"):
        from adapters.tavily import TavilySearchProvider
        tavily = True
    else:
        errors.append("TAVILY_API_KEY not set — web search skipped")
    per_run = int(os.environ.get("TAVILY_QUERIES_PER_RUN", 20))
    new_opps, new_news, updates = [], [], []
    generic_scopes = []
    wb_hits, wb_attempted = 0, False
    from adapters.national_portals import french_phrase, portal_providers
    portals = portal_providers()
    portal_hits = {source_id: 0 for source_id, _provider, _lang in portals}
    portal_attempted = set()
    # Following, per scope: {source_id: [scopes that follow it]}.
    follow = {}
    for r in session.execute(sql_text("select scope_id::text s, source_id from scope_sources")):
        for sc in run_scopes:
            if sc.id == r.s and S.enabled("search", sc):
                follow.setdefault(r.source_id, []).append(sc)
    for scope in run_scopes:
        if not S.enabled("search", scope):
            print(f"[{scope.name}] Search Agent switched off")
            continue
        cfg = scope.search or {}
        if cfg.get("mode") == "generic":
            generic_scopes.append(scope)  # runs after the followed sources are checked
            continue
        # A few phrases a day, not the whole list: ten phrases at 50 notices each
        # filled the queue and the 30-minute job died before later scopes or any news.
        ted_phrases = rotate(cfg.get("ted_phrases") or TED_PHRASES, 3)
        news_queries = rotate(cfg.get("news_queries") or NEWS_QUERIES, 2)
        found = set()
        new = run_discovery(session, TedSearchProvider(limit=10, lookback_days=21), {"ted": ted_phrases}, country_codes, errors=errors, found=found)
        query_count += len(ted_phrases)
        wb_terms = rotate(cfg.get("wb_queries") or [], 1)
        if wb_terms:
            from adapters.world_bank import WorldBankSearchProvider
            before = len(found)
            new += run_discovery(session, WorldBankSearchProvider(), {"web": wb_terms}, country_codes, errors=errors, found=found)
            wb_hits += len(found) - before
            wb_attempted = True
            query_count += len(wb_terms)
        # One term per portal. English for the UK and EBRD, the French phrase
        # for BOAMP, the Dutch term for TenderNed. Page size stays small.
        en = ((cfg.get("wb_queries") or []) or (cfg.get("ted_phrases") or []) or [None])[0]
        term = {
            "en": en, "any": en,
            "fr": french_phrase(cfg.get("ted_phrases") or []),
            "nl": ((cfg.get("nl_queries") or []) or [None])[0],
        }
        for source_id, provider, lang in portals:
            query = term.get(lang)
            if not query:
                continue
            before = len(found)
            new += run_discovery(
                session, provider, {"web": [query]}, country_codes,
                errors=errors, found=found, source_id=source_id,
            )
            portal_hits[source_id] += len(found) - before
            portal_attempted.add(source_id)
            query_count += 1
        if tavily:
            web_queries = rotate(cfg["web_queries"], min(2, per_run)) if cfg.get("web_queries") else tavily_queries_for_today(per_run)
            new += run_discovery(session, TavilySearchProvider(), {"web": web_queries}, country_codes, errors=errors, found=found)
            new += run_discovery(session, TavilySearchProvider(topic="news", days=30), {"news": news_queries}, country_codes, errors=errors, found=found)
            query_count += len(web_queries) + len(news_queries)
        link(found, [scope.id])
        candidates += new
        print(f"[{scope.name}] search: {len(found)} results, {len(new)} new candidates")
    if wb_attempted:
        wb_errors = [e for e in errors if "WorldBank" in e]
        session.execute(sql_text("""update sources set last_checked = now(),
            last_successful_check = case when :err is null then now() else last_successful_check end,
            last_error = :err, number_results_last_run = :n
            where source_id = 'INTL-027'"""),
            {"err": (wb_errors[-1][:300] if wb_errors else None), "n": wb_hits})
        session.commit()
    for source_id, provider, _lang in portals:
        if source_id not in portal_attempted:
            continue
        label = type(provider).__name__
        bad = [e for e in errors if e.startswith(label)]
        session.execute(sql_text("""update sources set last_checked = now(),
            last_successful_check = case when :err is null then now() else last_successful_check end,
            last_error = :err, number_results_last_run = :n
            where source_id = :sid"""),
            {"sid": source_id, "err": (bad[-1][:300] if bad else None), "n": portal_hits[source_id]})
    if portal_attempted:
        session.commit()

    # Followed sources (Following sidebar): RSS feeds and domain searches on
    # their own schedules; whatever they surface joins every scope's queue.
    from agents.source_monitor import check_sources, ingest_activity
    monitored = check_sources(session, errors, follow=follow) if follow else {"checked": 0, "total": 0, "found": 0}
    from_sources = ingest_activity(session)
    triaged_scopes = [s for s in run_scopes if (s.search or {}).get("mode") != "generic"]
    # A followed source's finds go to the industry scopes that follow it (generic scopes read them below).
    for r in session.execute(sql_text(
            "select candidate_id, source_id from candidates c where not c.processed and not exists (select 1 from candidate_scopes cs where cs.candidate_id = c.candidate_id)")).fetchall():
        targets = [sc for sc in follow.get(r.source_id, []) if sc in triaged_scopes] if r.source_id else triaged_scopes
        link([r.candidate_id], [sc.id for sc in targets])

    # Generic scopes (General): structured scoring, then the same public summary as other scopes.
    for scope in generic_scopes:
        from agents import generic_scope, market_fit
        followed = [sid for sid, scs in follow.items() if scope in scs]
        try:
            g = generic_scope.run(session, scope, promote, country_names, errors,
                                  TavilySearchProvider if tavily else None, followed=followed)
        except Exception as e:
            errors.append(f"{scope.name}: {e}")
            print(f"[{scope.name}] generic failed: {e}")
            S.mark_failed(session, scope, str(e))
            continue
        new_opps += g["tenders"]; new_news += g["news"]; updates += g["updated"]
        print(f"[{scope.name}] generic: {g['checked']} TED notices scored, {len(g['tenders'])} new tenders, "
              f"{len(g['news'])} new stories ({g['from_sources']} from followed sources)")
        try:
            fixed = market_fit.catch_up(session, scope, errors)
        except Exception as e:
            errors.append(f"{scope.name} summaries: {e}")
            print(f"[{scope.name}] summary rewrite failed: {e}")
        else:
            if fixed["rewritten"] or fixed["placed"]:
                print(f"[{scope.name}] rewrote {fixed['rewritten']} summaries, filed {fixed['placed']} onto other markets")
        S.mark_ran(session, scope)
    print(f"Sources: {monitored['checked']} of {monitored['total']} monitored sources due and checked, "
          f"{monitored['found']} new items, {from_sources} new candidates")

    # --- 2. Triage (per scope, with that scope's rules) ----------------------
    max_triage = int(os.environ.get("MAX_TRIAGE_PER_RUN", 640))
    llm_calls = 0
    for scope in triaged_scopes:
        if not S.enabled("triage", scope):
            print(f"[{scope.name}] Triage Agent switched off")
            S.mark_ran(session, scope)
            continue
        prompt_dir = os.path.join(os.path.dirname(__file__), "prompts")
        prompt = S.prompt_for("triage.md", open(os.path.join(prompt_dir, "triage.md")).read(), scope)
        copy_prompt = S.prompt_for("triage.md", open(os.path.join(prompt_dir, "triage_copy.md")).read(), scope, use_override=False)
        take_cache_usage()
        # Followed sources and news ahead of the TED backlog, or a scope that
        # already has tenders never reaches its stories. Cap the batch so one
        # scope cannot spend the whole run.
        per_scope = min(40, max(24, max_triage // max(1, len(triaged_scopes))))
        pending_ids = [r.candidate_id for r in session.execute(sql_text(
            """select cs.candidate_id from candidate_scopes cs join candidates c using (candidate_id)
               where cs.scope_id = cast(:s as uuid) and cs.processed_at is null
               order by case
                 when coalesce(c.discovery_query, '') like 'followed source:%' then 0
                 when coalesce(c.potential_categories::text, '') like '%news%' then 1
                 else 2 end,
                 c.discovered_at
               limit :n"""),
            {"s": scope.id, "n": per_scope})]
        pending = session.query(Candidate).filter(Candidate.candidate_id.in_(pending_ids)).all() if pending_ids else []

        def done(c, result):
            session.execute(sql_text("""update candidate_scopes set processed_at = now(), relevance = :r, candidate_type = :t
                                        where candidate_id = :c and scope_id = cast(:s as uuid)"""),
                            {"r": int(result.get("relevance") or 0), "t": result.get("type"), "c": c.candidate_id, "s": scope.id})

        to_llm = []
        for c in pending:
            if heuristic_prefilter(c):
                to_llm.append(c)
            else:
                result = {"relevance": 0, "type": "FALSE_POSITIVE", "reason": "Matched automatic suppression term list."}
                apply_triage_result(session, c, result)
                done(c, result)
        session.commit()

        # Worker threads get detached copies: ORM objects are expired on every
        # commit and must not be lazy-loaded from other threads.
        def _snap(c):
            return SimpleNamespace(title=c.title, description=c.description, source_url=c.source_url,
                                   country=c.country, discovery_query=c.discovery_query)

        def _score(snap):
            try:
                return run_triage_llm(snap, prompt), None
            except Exception as e:
                return None, e

        failures = streak = seen = 0
        aborted = False

        def _abort(err):
            nonlocal aborted
            errors.append(f"Triage aborted after {streak} consecutive failures: {err}"[:300])
            aborted = True

        def _fail(c, err):
            nonlocal failures, streak, seen
            seen += 1
            errors.append(f"triage {c.candidate_id}: {err}")
            failures += 1
            streak += 1
            # Bad key, no credit, outage: stop instead of failing the whole queue.
            if (seen >= 5 and failures == seen) or streak >= 10:
                _abort(err)

        def _keep(c, result):
            nonlocal streak, seen, llm_calls
            seen += 1
            streak = 0
            llm_calls += 1
            category, _awarded = classify_opportunity(c, result)
            from_news = "news" in (c.potential_categories or [])
            if needs_public_copy(result, category=category, from_news_search=from_news, promote_at=PROMOTE_THRESHOLD):
                try:
                    result.update(run_triage_copy(c, copy_prompt, result))
                    llm_calls += 1
                except Exception as e:
                    errors.append(f"triage copy {c.candidate_id}: {e}")
                    streak += 1
                    if streak >= 10:
                        _abort(e)
                    return
            apply_triage_result(session, c, result)
            done(c, result)
            promoted = promote(session, c, result, country_names)
            if promoted:
                kind, row = promoted[0], promoted[1]
                is_news = kind in ("news", "unchanged_news")
                item_id = row.news_id if is_news else row.opportunity_id
                score = int(result.get("importance") or 0) if is_news else int(result.get("relevance") or 0)
                from services.publication import publish_reason, stage_of
                public = bool(getattr(scope, "catalog", False) or getattr(scope, "is_default", False))
                stage = None if is_news else stage_of(getattr(row, "status", None), getattr(row, "opportunity_type", None), getattr(row, "deadline", None))
                why = publish_reason(getattr(row, "summary", None) or result.get("summary") or "", result.get("reason") or "", public=public, stage=stage)[:500]
                session.execute(sql_text("""insert into scope_items (scope_id, item_type, item_id, relevance, candidate_type, reason)
                        values (cast(:s as uuid), :t, :i, :r, :ct, :why)
                        on conflict (scope_id, item_type, item_id) do update set relevance = excluded.relevance, reason = excluded.reason"""),
                                {"s": scope.id, "t": "news" if is_news else "tender", "i": item_id, "r": score,
                                 "ct": result.get("type"), "why": why})
                if kind == "opportunity":
                    new_opps.append(row)
                elif kind == "updated":
                    updates.append({"opportunity": row.title, "change": "; ".join(promoted[2]),
                                    "action": f"Review: {row.official_url}"})
                elif kind == "news":
                    new_news.append(row)
            session.commit()
            if seen % 25 == 0:
                print(f"  [{scope.name}] triaged {seen}/{len(to_llm)}")

        # The first call writes the prompt cache. The rest start after it returns,
        # or eight parallel calls would all miss.
        calls_before = llm_calls
        if to_llm:
            result, err = _score(_snap(to_llm[0]))
            if err:
                _fail(to_llm[0], err)
            else:
                _keep(to_llm[0], result)
        if not aborted and len(to_llm) > 1:
            with ThreadPoolExecutor(max_workers=8) as pool:
                rest = to_llm[1:]
                for c, (result, err) in zip(rest, pool.map(_score, [_snap(c) for c in rest])):
                    if err:
                        _fail(c, err)
                    else:
                        _keep(c, result)
                    if aborted:
                        pool.shutdown(wait=False, cancel_futures=True)
                        break
        cache = take_cache_usage()
        print(f"[{scope.name}] triage: {len(pending)} queued, {len(to_llm)} scored, {llm_calls - calls_before} LLM calls, "
              f"prompt cache {cache['creation']} tokens written, {cache['read']} tokens read")
        if aborted:
            S.mark_failed(session, scope, errors[-1] if errors else "Collection failed")
            break
        S.mark_ran(session, scope)
    # A tender's own relevance is the best any scope gave it (cards then show the viewer's scopes').
    session.execute(sql_text("""update opportunities o set opportunity_relevance_score = m.r, relevance_score = m.r
        from (select item_id, max(relevance) r from scope_items where item_type = 'tender' group by item_id) m
        where m.item_id = o.opportunity_id and m.r is distinct from o.opportunity_relevance_score"""))
    session.commit()
    print(f"Triage: {llm_calls} LLM calls -> {len(new_opps)} opportunities, {len(updates)} updates, {len(new_news)} news items")

    from agents.source_monitor import mark_relevance
    mark_relevance(session)

    # --- 3. Verification: is each opportunity actually open today? ----------
    verified = verify_opportunities(session, errors)  # internal agent: always on
    print(f"Verification: {verified} opportunities checked against their source")

    # A tender or a news story found off a portal still needs the official notice.
    # This covers every scope: the rows are not filtered by which scope saved them.
    from agents.official_notice import align_summaries, refresh_open, resolve_official, resolve_from_news
    linked = resolve_official(session, errors)
    from_news = resolve_from_news(session, errors)
    aligned = align_summaries(session)
    refreshed = refresh_open(session, errors)
    if linked or from_news or aligned or refreshed:
        print(f"Official notices: {linked} tenders linked, {from_news} found from news, "
              f"{aligned} summaries aligned, {refreshed} re-read from the latest notice")

    # Tender documents (TED notices + buyer portal lists) and what bidders must meet.
    from agents.tender_documents import collect_all
    from agents.tender_analysis import analyse_tenders
    # Buyer portals: once a day is enough (the pipeline itself runs every 4 hours).
    last_docs = session.execute(sql_text("select value->>'at' from app_settings where key = 'documents_run'")).scalar()
    docs_due = not last_docs or (datetime.utcnow() - datetime.fromisoformat(last_docs)).total_seconds() > 20 * 3600
    if S.enabled("tender_documents") and docs_due:
        session.execute(sql_text("""insert into app_settings (key, value) values ('documents_run', jsonb_build_object('at', cast(:t as text)))
                                    on conflict (key) do update set value = excluded.value"""), {"t": datetime.utcnow().isoformat()})
        session.commit()
        docs = collect_all(session, errors)
        print(f"Documents: {docs['documents']} across {docs['opportunities']} active tenders, {docs['new']} new")
    elif S.enabled("tender_documents"):
        from agents.tender_documents import collect_missing
        missing = collect_missing(session, errors)
        if missing["opportunities"]:
            print(f"Documents: {missing['documents']} for {missing['opportunities']} tenders that had none yet")
    if S.enabled("tender_analysis"):
        analysed = analyse_tenders(session, errors)
        print(f"Award criteria: {analysed['award']} from TED notices")

    from agents.official_notice import release_unofficial
    released = release_unofficial(session)
    if released:
        session.commit()
        print(f"Classification: {len(released)} items without an official notice or requirement documents kept as signals")

    # English titles for anything that predates triage's title_en, and for activity;
    # English notes for tender updates (shown as comments).
    from agents.translator import backfill_english_titles
    from agents.translator import write_update_notes
    translated = backfill_english_titles(session, errors) if S.enabled("translator") else 0
    noted = write_update_notes(session, errors) if S.enabled("translator") else 0
    if noted:
        print(f"Update notes: {noted} written")
    if translated:
        print(f"Translation: {translated} titles given an English version")

    from agents.news_images import fetch_news_images
    images = fetch_news_images(session)
    if images:
        print(f"News images: {images} found")

    # --- 4. Feed: agents post new events, then the feed is re-ranked ---------
    from agents.feed_writer import publish_new_posts, rank_posts
    # After a language change every post is rewritten in the new language.
    posted = publish_new_posts(session, errors, rewrite=language_changed) if S.enabled("feed_writer") else 0
    ranked = rank_posts(session)
    print(f"Feed: {posted} new posts, {ranked} posts ranked")

    # --- 5. Digest ------------------------------------------------------------
    digest_opps = [{
        "priority": "P1" if (o.opportunity_relevance_score or 0) >= 75 else "P2",
        "country": country_names.get(o.country, o.country or "International"),
        "project": o.title, "authority": o.authority or "UNCLEAR",
        "type": o.opportunity_type, "deadline": o.deadline.date().isoformat() if o.deadline else "NOT_DISCLOSED",
        "opportunity_score": o.opportunity_relevance_score,
        "details": {"sources": o.official_url or ""},
    } for o in new_opps if o.opportunity_type != "signal" and o.status != "AWARDED"]
    signals = [{
        "country": country_names.get(o.country, o.country or "International"),
        "signal": o.title, "action": f"Review: {o.official_url}",
    } for o in new_opps if o.opportunity_type == "signal"]

    coverage = CoverageStats(
        countries_checked=len(countries), countries_total=len(countries),
        sources_checked=monitored["checked"] + 1, sources_total=monitored["total"],  # +1: TED
        queries_executed=query_count, candidates_found=len(candidates),
        deep_analyses_executed=0, new_opportunities=len(digest_opps),
        material_updates=len(updates), errors=errors,
    )
    digest_md = render_daily_digest(
        run_date=date.today(), coverage=coverage, new_opportunities=digest_opps,
        rollout_changes=[], early_signals=signals, existing_updates=updates,
    )
    out_dir = os.path.join(os.path.dirname(__file__), "reports", "daily")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{date.today().isoformat()}.md")
    with open(out_path, "w") as f:
        f.write(digest_md)

    agent_run.finished_at = datetime.utcnow()
    agent_run.status = "COMPLETE"
    session.commit()
    S.mark_pipeline_ran(session)
    session.close()
    print(f"Digest written to {out_path}" + (f" ({len(errors)} errors)" if errors else ""))
    return out_path


if __name__ == "__main__":
    main()
