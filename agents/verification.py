"""
Status verification — is an opportunity actually open today?

Triage only sees a search snippet and can't judge dates, so every promoted
opportunity without a structured deadline is checked here before it can show
as active on the site:

- TED notices: read the deadline (or planned date) from the notice's eForms XML.
- Everything else: fetch the source page and have the LLM judge it against
  today's date, quoting its evidence.

Anything that can't be confirmed becomes UNVERIFIED (Database page only).
"""
import os
import re
import sys
from datetime import datetime, timedelta
from typing import Optional

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from services.llm_client import call_llm_json, load_prompt, CHEAP_MODEL  # noqa: E402

# Undated "currently open" claims and signals older than this don't count.
MAX_AGE_DAYS = 183
REVERIFY_AFTER_DAYS = 7
_PAGE_CHARS = 20000
_PROMPT = None


def _date(value) -> Optional[datetime]:
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d") if value else None
    except ValueError:
        return None


def fetch_page_text(url: str, tavily=None) -> str:
    """Readable page text: Tavily's extractor when available, else raw HTML stripped."""
    if tavily is not None:
        try:
            text = tavily.fetch(url)
            if text and len(text) > 200:
                return text[:_PAGE_CHARS]
        except Exception:
            pass
    resp = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0 (EUDI Opportunity Radar)"})
    resp.raise_for_status()
    html = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", resp.text)
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text).strip()[:_PAGE_CHARS]


def llm_verify(category: str, title: str, page_text: str, today: datetime) -> dict:
    global _PROMPT
    if _PROMPT is None:
        _PROMPT = load_prompt("verification.md")
    return call_llm_json(
        system_prompt=_PROMPT,
        user_content=(f"Today's date: {today.date().isoformat()}\n"
                      f"Category: {category}\nTitle: {title}\n\n"
                      f"Source page text:\n{page_text}"),
        model=CHEAP_MODEL, max_tokens=512,
    )


def resolve(category: str, v: dict, today: datetime):
    """Map a verification verdict to (status, deadline, dated, category).
    Statuses: OPEN, SIGNAL (both shown as active), CLOSED, AWARDED,
    UNVERIFIED, REJECTED (not shown as active)."""
    verdict = (v.get("status") or "UNKNOWN").upper()
    deadline, dated = _date(v.get("deadline")), _date(v.get("dated"))
    recent = dated is not None and today - dated <= timedelta(days=MAX_AGE_DAYS)

    if verdict in ("CLOSED", "AWARDED"):
        return verdict, deadline, dated, category
    if verdict == "NOT_AN_OPPORTUNITY":
        return "REJECTED", deadline, dated, category
    if deadline:  # a stated deadline decides it
        if deadline < today:
            return "CLOSED", deadline, dated, category
        return ("SIGNAL" if verdict == "UPCOMING" else "OPEN"), deadline, dated, \
            ("signal" if verdict == "UPCOMING" else category)
    if verdict == "OPEN" and recent:
        return "OPEN", None, dated, category
    if verdict == "UPCOMING" and recent:
        # Announced but not open yet: that is a signal, whatever triage called it.
        return "SIGNAL", None, dated, "signal"
    return "UNVERIFIED", None, dated, category


def verify_ted(ted_provider, publication_number: str, category: str, today: datetime):
    """TED notices without a deadline in the search fields: read the XML."""
    d = ted_provider.notice_dates(publication_number)
    deadline, planned = _date(d.get("deadline")), _date(d.get("planned_date"))
    if d.get("awarded"):
        return "AWARDED", None, "The contract award notice is published."
    if deadline:
        status = "OPEN" if deadline >= today else "CLOSED"
        return status, deadline, f"TED notice deadline {deadline.date().isoformat()}"
    if category == "signal" and planned and planned >= today - timedelta(days=MAX_AGE_DAYS):
        return "SIGNAL", None, f"TED prior information notice: procurement planned for {planned.date().isoformat()}"
    return "UNVERIFIED", None, "TED notice states no deadline"
