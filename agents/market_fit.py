"""File a tender on the catalog markets it actually matches.

General (and any other first pass) can keep a tender that also belongs on a
narrower market. One cheap call reads the written summary and the markets'
own instructions, and adds a scope_items row where the fit is real. An
existing row is left alone, so a market that already scored the tender keeps
its own relevance and reason.

Score-card summaries left by the old General path are rewritten here, a few
per run, with the same public-text pass the other scopes use.
"""
import os
import re
from types import SimpleNamespace

from sqlalchemy import text as sql

from agents.tender_documents import notice_brief
from agents.triage import run_triage_copy
from services.facts import correct_known_facts
from services.llm_client import CHEAP_MODEL, call_llm_json
from services.publication import neutralize, publish_reason

FLOOR = 50
BACKFILL = 20
_SCORE_CARD = re.compile(r"·\s+-?\d+\s+days to bid\s*$")
_PUB = re.compile(r"(\d{5,}-\d{4})")


def score_card(text: str) -> bool:
    return bool(_SCORE_CARD.search(text or ""))


def chosen(raw, allowed: set, floor: int = FLOOR) -> list:
    """Scope ids the model named that we actually offered, at or above the floor."""
    out, seen = [], set()
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        sid = str(item.get("id") or "")
        try:
            rel = int(item.get("relevance") or 0)
        except (TypeError, ValueError):
            continue
        if sid in allowed and sid not in seen and rel >= floor:
            seen.add(sid)
            out.append((sid, rel))
    return out


def catalog_markets(session) -> list:
    rows = session.execute(sql("""
        select id::text as id, name,
               left(regexp_replace(coalesce(instructions, ''), '\\s+', ' ', 'g'), 240) as blurb
        from scopes
        where catalog and active
        order by name
    """)).fetchall()
    return [{"id": r.id, "name": r.name or "", "blurb": (r.blurb or "").strip()} for r in rows]


def place(session, opportunity_id: str, title: str, summary: str, country, authority, reason: str, markets: list) -> int:
    """Add scope_items for markets this tender belongs on. Returns how many were added."""
    if not markets or not (summary or "").strip() or score_card(summary):
        return 0
    allowed = {m["id"] for m in markets}
    listing = "\n".join(f"- {m['id']} | {m['name']}: {m['blurb']}" for m in markets)
    system = (
        "You file one public tender onto the markets it belongs to.\n"
        "Each market is one scope. A tender belongs there only when the purchase is what that market watches.\n"
        "A software contract, a large contract, or a public buyer is not enough on its own.\n"
        "A tender may belong on several markets, or on none.\n"
        'Reply with JSON only: {"markets": [{"id": "<scope id>", "relevance": <integer 0-100>}]}\n'
        "Include a market only when its relevance is at least 50. Use only ids from the list.\n\n"
        "Markets:\n" + listing
    )
    user = f"Title: {title}\nBuyer: {authority or 'unknown'}\nCountry: {country or 'unknown'}\nSummary:\n{summary}"
    raw = call_llm_json(system, user, model=CHEAP_MODEL, max_tokens=512)
    hits = chosen(raw.get("markets"), allowed)
    why = (publish_reason(summary, reason) or summary)[:500]
    added = 0
    for sid, rel in hits:
        result = session.execute(sql("""
            insert into scope_items (scope_id, item_type, item_id, relevance, candidate_type, reason)
            values (cast(:s as uuid), 'tender', :i, :r, 'TENDER', :why)
            on conflict (scope_id, item_type, item_id) do nothing
        """), {"s": sid, "i": opportunity_id, "r": rel, "why": why})
        added += result.rowcount or 0
    return added


def _copy_prompt(scope) -> str:
    from services.agent_settings import prompt_for
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "prompts", "triage_copy.md")
    with open(path) as f:
        return prompt_for("triage.md", f.read(), scope, use_override=False)


def write_summary(scope, title: str, description: str, url: str, country, authority, deadline, relevance: int,
                  prompt: str | None = None) -> dict:
    """The public summary, reason, and title, from the same pass the other scopes use."""
    candidate = SimpleNamespace(
        title=title, description=(description or "")[:2000], source_url=url,
        country=country, discovery_query="general: large tenders",
    )
    scored = {"type": "TENDER", "relevance": relevance, "country": country,
              "authority": authority, "deadline": deadline, "language": None}
    return run_triage_copy(candidate, prompt or _copy_prompt(scope), scored)


def catch_up(session, scope, errors: list, limit: int = BACKFILL) -> dict:
    """Rewrite General's score-card summaries and file those tenders on matching markets."""
    if not getattr(scope, "is_default", False):
        return {"rewritten": 0, "placed": 0}
    rows = session.execute(sql("""
        select o.opportunity_id, o.title, o.summary, o.official_url, o.country, o.authority, o.deadline
        from opportunities o
        join scope_items si on si.item_id = o.opportunity_id and si.item_type = 'tender'
        join scopes s on s.id = si.scope_id and s.is_default
        where o.status in ('OPEN', 'SIGNAL')
          and o.summary ~ 'days to bid[[:space:]]*$'
        order by o.first_detected desc nulls last
        limit :n
    """), {"n": limit}).fetchall()
    if not rows:
        return {"rewritten": 0, "placed": 0}
    markets = catalog_markets(session)
    prompt = _copy_prompt(scope)
    rewritten = placed = 0
    for row in rows:
        number = _PUB.search(row.official_url or "")
        brief = notice_brief(number.group(1)) if number else ""
        deadline = row.deadline.strftime("%Y-%m-%d") if row.deadline else None
        description = f"Buyer: {row.authority or 'unknown'}. Deadline: {deadline or 'unknown'}."
        if brief:
            description = f"{description}\n{brief}"
        try:
            written = write_summary(scope, row.title, description, row.official_url, row.country,
                                    row.authority, deadline, 60, prompt)
        except Exception as e:
            errors.append(f"general summary {row.opportunity_id}: {e}")
            continue
        summary = neutralize(correct_known_facts((written.get("summary") or "").strip()))
        if not summary or score_card(summary):
            continue
        why = (publish_reason(summary, written.get("reason") or "") or summary)[:500]
        title_en = (correct_known_facts(written.get("title_en") or "").strip() or None)
        session.execute(sql("""
            update opportunities
            set summary = :summary, title_en = coalesce(:title_en, title_en)
            where opportunity_id = :id
        """), {"summary": summary, "title_en": title_en, "id": row.opportunity_id})
        session.execute(sql("""
            update scope_items set reason = :why
            where item_id = :id and item_type = 'tender' and reason ~ 'days to bid[[:space:]]*$'
        """), {"why": why, "id": row.opportunity_id})
        try:
            placed += place(session, row.opportunity_id, title_en or row.title, summary,
                            row.country, row.authority, written.get("reason") or "", markets)
        except Exception as e:
            errors.append(f"market fit {row.opportunity_id}: {e}")
        rewritten += 1
        session.commit()
    return {"rewritten": rewritten, "placed": placed}
