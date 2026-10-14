from __future__ import annotations

"""Checks a public reading before it is stored.

The summary states the facts. The reason is the interpretation shown as
"Why this matters". A reason that contradicts the summary on dates, whether
work is still planned or already done, whether a procurement is open, or who
the buyer is, is withheld. A public summary never addresses the company the
agents are briefed for.
"""
import os
import re
from datetime import date

_ROOT = os.path.join(os.path.dirname(__file__), "..")

_MONTHS = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3,
    "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10, "november": 11, "nov": 11, "december": 12, "dec": 12,
}

_DATE = re.compile(
    r"\b(?:(?P<d>\d{1,2})(?:st|nd|rd|th)?\s+)?"
    r"(?P<m>january|february|march|april|may|june|july|august|september|october|november|december|"
    r"jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(?P<y>20\d{2})\b"
    r"|\b(?P<y2>20\d{2})-(?P<m2>\d{2})-(?P<d2>\d{2})\b",
    re.I,
)
_DONE = re.compile(
    r"\b(has launched|have launched|launched|went live|rolled out|rollout completed|completed by|"
    r"already (?:live|launched|completed)|was completed|has been completed)\b",
    re.I,
)
_PLAN = re.compile(
    r"\b(plans? to|planned to|scheduled to|will launch|set to launch|expected to|due to launch|"
    r"to be launched|launch(?:es)? on|scheduled for)\b",
    re.I,
)
_NO_PROC = re.compile(
    r"\bno (?:open |direct |specific )?(?:tender|procurement|rfp|call\b)|not a procurement|"
    r"no procurement|no vendor engagement|contains no direct procurement\b",
    re.I,
)
_OPEN = re.compile(
    r"\b(?:tender is open|bids are open|open for bids|call is open|has been awarded|"
    r"contract was awarded|awarded the contract)\b",
    re.I,
)
_BUYER = re.compile(r"\b(?:buyer|contracting authority)\s*(?:is|:)\s*([^.;\n]{3,80})", re.I)


def vendor_names() -> set[str]:
    """The company the agents are briefed for, from the company brief's title."""
    path = os.path.join(_ROOT, "webapp", "agents", "company_brief.md")
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        return set()
    return {m.group(1) for m in re.finditer(r"^#\s+([A-Za-z][A-Za-z0-9]+)\b", text, re.M) if len(m.group(1)) > 2}


def _when(match: re.Match) -> date | None:
    try:
        if match.group("y2"):
            return date(int(match.group("y2")), int(match.group("m2")), int(match.group("d2")))
        return date(int(match.group("y")), _MONTHS[match.group("m").lower()], int(match.group("d") or 1))
    except (ValueError, KeyError):
        return None


def _dates(text: str) -> list[tuple[int, date]]:
    found = []
    for match in _DATE.finditer(text or ""):
        day = _when(match)
        if day:
            found.append((match.start(), day))
    return found


def _near(text: str, cue: re.Pattern, window: int = 80) -> list[date]:
    days = []
    for hit in cue.finditer(text or ""):
        start, end = max(0, hit.start() - window), min(len(text), hit.end() + window)
        days.extend(day for _, day in _dates(text[start:end]))
    return days


def _completed_before(text: str) -> bool:
    """A later date said to be finished by an earlier one, in one sentence."""
    for sentence in re.split(r"[.!?]", text or ""):
        done = _DONE.search(sentence)
        if not done:
            continue
        dated = _dates(sentence)
        if len(dated) < 2:
            continue
        by = re.search(r"\bby\b", sentence[done.end():], re.I)
        if not by:
            continue
        at = done.end() + by.start()
        before = [day for pos, day in dated if pos < at]
        after = [day for pos, day in dated if pos >= at]
        if before and after and max(before) > min(after):
            return True
    return False


def contradicts(summary: str, reason: str) -> bool:
    """True when the interpretation disagrees with the summary."""
    summary, reason = summary or "", reason or ""
    if not reason.strip():
        return False
    if _completed_before(reason):
        return True
    planned = _near(summary, _PLAN)
    if planned and _DONE.search(reason):
        done = _near(reason, _DONE) or [day for _, day in _dates(reason)]
        if not done or max(planned) > min(done):
            return True
    no_proc = bool(_NO_PROC.search(summary)), bool(_NO_PROC.search(reason))
    opened = bool(_OPEN.search(summary)), bool(_OPEN.search(reason))
    if (no_proc[0] and opened[1]) or (opened[0] and no_proc[1]):
        return True
    buyers_s, buyers_r = _BUYER.findall(summary), _BUYER.findall(reason)
    if buyers_s and buyers_r:
        left = re.sub(r"[^a-z0-9]+", " ", buyers_s[0].lower()).strip()
        right = re.sub(r"[^a-z0-9]+", " ", buyers_r[0].lower()).strip()
        if left and right and left not in right and right not in left:
            return True
    return False


def neutralize(text: str, names: set[str] | None = None) -> str:
    """Drop a configured company from a public sentence. Buyers stay."""
    names = vendor_names() if names is None else names
    if not text or not names:
        return (text or "").strip()
    kept = []
    for sentence in re.split(r"(?<=[.!?])\s+", text.strip()):
        if not any(re.search(rf"\b{re.escape(name)}\b", sentence) for name in names):
            kept.append(sentence)
            continue
        cleaned = sentence
        for name in names:
            cleaned = re.sub(rf"\bFor {re.escape(name)},?\s*", "", cleaned)
            cleaned = re.sub(rf"\s*[—-]\s*exactly the scope {re.escape(name)} targets", "", cleaned)
            cleaned = re.sub(rf"\b(?:for|to) {re.escape(name)}\b", "for a supplier in this market", cleaned)
            cleaned = re.sub(rf"\b{re.escape(name)}(?:'s)?\b", "", cleaned)
        cleaned = re.sub(r"\s{2,}", " ", cleaned)
        cleaned = re.sub(r"\s+([,.])", r"\1", cleaned)
        cleaned = re.sub(r"\(\s*\)", "", cleaned).strip(" ,—-")
        if len(re.sub(r"[^A-Za-z]", "", cleaned)) < 25:
            continue
        if cleaned and cleaned[-1] not in ".!?":
            cleaned += "."
        if cleaned[:1].islower():
            cleaned = cleaned[:1].upper() + cleaned[1:]
        kept.append(cleaned)
    return " ".join(kept).strip()


def publish_reason(summary: str, reason: str, public: bool = True) -> str:
    """The interpretation to store. Empty when it contradicts the summary."""
    text = neutralize(reason) if public else (reason or "").strip()
    if contradicts(neutralize(summary), text):
        return ""
    return text.strip()


def self_check() -> None:
    summary = "Germany's federal government plans to launch its EUDI Wallet app called 'd-you' on 2 January 2027."
    reason = "Germany's d-you wallet has launched (January 2027 rollout completed by October 2026)."
    assert contradicts(summary, reason), "planned launch versus completed rollout"
    assert publish_reason(summary, reason) == ""
    assert not contradicts(summary, "A later contract could follow the launch. Watch the federal procurement portal.")
    neutral = neutralize(
        "This is a direct national wallet infrastructure procurement — exactly the scope WalliD targets. The tender closed on 2026-09-07."
    )
    assert "WalliD" not in neutral and "tender closed" in neutral
    opened = neutralize("For WalliD, this reinforces market demand and urgency for wallet solutions and integration partners.")
    assert opened.startswith("This reinforces") and "WalliD" not in opened
    assert not contradicts(
        "The article reports no open tender.",
        "No procurement is open. Watch the ministry's notices.",
    )
    assert contradicts("The article reports no procurement.", "The tender is open for bids.")
    assert contradicts("The buyer is Brno University Hospital.", "The buyer is the Ministry of Defence.")
