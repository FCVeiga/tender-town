"""
Agent 2 — Triage.

Scores each raw Candidate for relevance and decides whether it warrants
Agent 3 (deep document analysis). This is the cheap-model stage (spec
section 64) — classification only, no requirement extraction here.

The public summary and interpretation are a second call, and only after the
score clears the publish bar. The system prompt is marked for caching because
the same scope sends it once per candidate.
"""
import json
import sys
import os
import yaml
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "database"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from models import Candidate  # noqa: E402
from services.llm_client import call_llm_json, load_prompt, CHEAP_MODEL  # noqa: E402

CONFIG_DIR = os.path.join(os.path.dirname(__file__), "..", "config")

with open(os.path.join(CONFIG_DIR, "keywords.yaml")) as f:
    _KEYWORDS = yaml.safe_load(f)

_SUPPRESS_TERMS = [t.lower() for t in _KEYWORDS["false_positive_filter"]["suppress"]]

_DEEP_ANALYSIS_THRESHOLD = 60

_TRIAGE_SYSTEM_PROMPT = None


def _get_triage_prompt() -> str:
    global _TRIAGE_SYSTEM_PROMPT
    if _TRIAGE_SYSTEM_PROMPT is None:
        _TRIAGE_SYSTEM_PROMPT = load_prompt("triage.md")
    return _TRIAGE_SYSTEM_PROMPT


def heuristic_prefilter(candidate: Candidate) -> bool:
    text = f"{candidate.title or ''} {candidate.description or ''}".lower()
    return not any(term in text for term in _SUPPRESS_TERMS)


def _candidate_text(candidate: Candidate) -> str:
    return (
        f"Today's date: {date.today().isoformat()}\n"
        f"Title: {candidate.title or 'N/A'}\n"
        f"Description: {candidate.description or 'N/A'}\n"
        f"Source URL: {candidate.source_url or 'N/A'}\n"
        f"Country: {candidate.country or 'unknown'}\n"
        f"Discovery query: {candidate.discovery_query or 'N/A'}\n"
    )


def run_triage_llm(candidate: Candidate, system_prompt: str = None) -> dict:
    """Score one candidate. The reply is the classification, not the public text."""
    return call_llm_json(
        system_prompt=system_prompt or _get_triage_prompt(), user_content=_candidate_text(candidate),
        model=CHEAP_MODEL, max_tokens=1024, cache_system=True,
    )


# Importance at or below this is a market note. It is not shown, so it gets no
# summary call and no feed post. The figure stored on a news row is importance.
NEWS_NOTE_MAX = 15


def news_worth_showing(triage: dict) -> bool:
    """True when a news classification is above the market-note floor."""
    raw = triage.get("importance")
    score = int(triage.get("relevance") or 0) if raw is None or raw == "" else int(raw or 0)
    return score > NEWS_NOTE_MAX


def needs_public_copy(triage: dict, *, category: str | None, from_news_search: bool,
                      promote_at: int = 50) -> bool:
    """True when promote() will keep this row and the summary or the reason is still missing.

    A tender is kept at relevance >= promote_at with a category. A news story is
    kept when the hit came from a news search, the type is NEWS_ONLY, relevance
    is above 0, and importance is above the market-note floor. A row that already
    has both texts does not need the second call."""
    if (triage.get("summary") or "").strip() and (triage.get("reason") or "").strip():
        return False
    relevance = int(triage.get("relevance") or 0)
    if category and relevance >= promote_at:
        return True
    return ((triage.get("type") or "").upper() == "NEWS_ONLY" and from_news_search
            and relevance > 0 and news_worth_showing(triage))


def run_triage_copy(candidate: Candidate, system_prompt: str, scored: dict) -> dict:
    """The summary, the reason, and the translated title, for a row that will be shown."""
    brief = {
        "type": scored.get("type"),
        "relevance": scored.get("relevance"),
        "country": scored.get("country"),
        "authority": scored.get("authority"),
        "deadline": scored.get("deadline"),
        "importance": scored.get("importance"),
        "news_category": scored.get("news_category"),
        "language": scored.get("language"),
    }
    user_content = (
        _candidate_text(candidate)
        + "\nClassification (already decided):\n"
        + json.dumps(brief, ensure_ascii=False)
        + "\nWrite summary, reason, and title_en for this classification.\n"
    )
    out = call_llm_json(
        system_prompt=system_prompt, user_content=user_content,
        model=CHEAP_MODEL, max_tokens=1024, cache_system=True,
    )
    summary, reason = (out.get("summary") or "").strip(), (out.get("reason") or "").strip()
    if not summary or not reason:
        raise ValueError("Triage copy omitted the summary or the reason")
    kept = {"summary": summary, "reason": reason}
    title = (out.get("title_en") or "").strip()
    if title:
        kept["title_en"] = title
    return kept


def apply_triage_result(session, candidate: Candidate, triage_output: dict):
    candidate.relevance = triage_output.get("relevance", 0)
    candidate.opportunity_probability = triage_output.get("opportunity_probability", 0.0)
    candidate.eudi_relevance = triage_output.get("eudi_relevance", "")
    candidate.commercial_relevance = triage_output.get("commercial_relevance", "")
    candidate.candidate_type = triage_output.get("type", "")
    candidate.triage_reason = triage_output.get("reason", "")
    candidate.deep_analysis_required = (
        triage_output.get("deep_analysis_required")
        or candidate.relevance >= _DEEP_ANALYSIS_THRESHOLD
    )
    candidate.triage_output = triage_output
    candidate.processed = True
    session.commit()
    return candidate


def triage_candidate(session, candidate: Candidate) -> Candidate:
    """Convenience wrapper: prefilter -> LLM call -> persist, in one step."""
    if not heuristic_prefilter(candidate):
        return apply_triage_result(session, candidate, {
            "relevance": 0, "opportunity_probability": 0.0,
            "eudi_relevance": "NONE", "commercial_relevance": "NONE",
            "type": "FALSE_POSITIVE",
            "reason": "Matched automatic suppression term list.",
            "deep_analysis_required": False,
        })
    result = run_triage_llm(candidate)
    ctype = (result.get("type") or "").upper()
    kept = ctype if ctype in {"TENDER", "RFI", "GRANT", "CONSORTIUM_CALL", "PILOT", "PIPELINE_SIGNAL"} else None
    if needs_public_copy(result, category=kept, from_news_search="news" in (candidate.potential_categories or [])):
        result.update(run_triage_copy(candidate, _copy_prompt(), result))
    return apply_triage_result(session, candidate, result)


def _copy_prompt() -> str:
    path = os.path.join(os.path.dirname(__file__), "..", "prompts", "triage_copy.md")
    with open(path) as f:
        return f.read()
