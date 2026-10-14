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
    r"\b(?:tender is open|bids are open|open for bids|call is open)\b",
    re.I,
)
_BUYER = re.compile(r"\b(?:buyer|contracting authority)\s*(?:is\b|:)\s*([^.;\n]{3,80})", re.I)


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


def _stated(pattern: re.Pattern, text: str) -> bool:
    """A match counts only when the previous words do not negate it."""
    for hit in pattern.finditer(text or ""):
        window = text[max(0, hit.start() - 40):hit.start()]
        if not re.search(r"\b(?:no|not|without|never)\b|n't", window, re.I):
            return True
    return False


_LIVE = re.compile(
    r"\b(?:open tender|currently open|still open|live tender|active tender|live procurement|"
    r"active procurement|open procurement|bids are open|open for bids|bidding is open|remains open|"
    r"openly tendering|is tendering)\b"
    r"|\blive\b(?:\s+\w+){0,6}\s+tender\b"
    r"|\bactive\b(?:\s+\w+){0,6}\s+tender\b",
    re.I,
)
_SHUT = re.compile(
    r"\b(?:bidding has closed|deadline has passed|no longer open|tender is closed|tender has closed|expired tender)\b",
    re.I,
)
_ADDS = re.compile(
    r"\b(?:suggests?|could|might|may|watch|monitor|renewal|a later|partner|roles?)\b",
    re.I,
)
_MONEY = re.compile(
    r"(?:estimated\s+(?:contract\s+)?value|contract\s+value|total\s+value|estimated\s+budget|budget\s+of)"
    r"\s*(?:of|is|:)?\s*(?:approximately\s+|approx\.?\s+)?"
    r"(?P<cur>€|EUR|euro|USD|\$|GBP|£)?\s*"
    r"(?P<num>\d{1,3}(?:[ .,\u00a0]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)"
    r"\s*(?P<cur2>€|EUR|euro|USD|\$|GBP|£)?"
    r"(?:\s*(?P<scale>million|mio|billion|bn))?",
    re.I,
)


def stage_of(status: str | None, opportunity_type: str | None = None, deadline=None, today: date | None = None) -> str:
    """open, closed, signal, or uncertain — the same stage the page shows."""
    today = today or date.today()
    kind = (opportunity_type or "").lower()
    state = (status or "").upper()
    if state == "UNVERIFIED":
        return "uncertain"
    if state == "SIGNAL" or kind == "signal":
        return "signal"
    if state in ("CLOSED", "AWARDED", "REJECTED"):
        return "closed"
    when = deadline.date() if hasattr(deadline, "date") else deadline
    if isinstance(when, date) and when < today:
        return "closed"
    if state == "OPEN":
        return "open"
    return "uncertain"


def lifecycle_conflict(stage: str | None, reason: str) -> bool:
    """The interpretation claims a bidding state the record does not have."""
    if not stage or not reason:
        return False
    live, shut = _stated(_LIVE, reason), _stated(_SHUT, reason)
    if stage == "closed":
        return live
    if stage == "open":
        return shut
    if stage == "signal":
        return live or shut
    if stage == "uncertain":
        return live or shut
    return False


def restates(summary: str, reason: str) -> bool:
    """True when the interpretation mostly repeats the summary and adds no decision."""
    if not reason or _ADDS.search(reason):
        return False
    stop = {"about", "after", "which", "their", "there", "these", "those", "would", "could", "other"}
    words = {w for w in re.findall(r"[a-z0-9]{5,}", reason.lower()) if w not in stop}
    if len(words) < 8:
        return False
    known = {w for w in re.findall(r"[a-z0-9]{5,}", (summary or "").lower())}
    return len(words & known) / len(words) >= 0.8


def _amount(raw: str) -> float | None:
    text = raw.replace("\u00a0", " ").replace(" ", "")
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        parts = text.split(",")
        text = text.replace(",", "") if len(parts[-1]) == 3 else text.replace(",", ".")
    elif text.count(".") > 1:
        text = text.replace(".", "")
    try:
        return float(text)
    except ValueError:
        return None


def stated_value(text: str) -> tuple[float, str] | None:
    """A value the summary itself calls the contract or estimated value."""
    hit = _MONEY.search(text or "")
    if not hit:
        return None
    amount = _amount(hit.group("num"))
    if amount is None or amount <= 0:
        return None
    scale = (hit.group("scale") or "").lower()
    if scale in ("million", "mio"):
        amount *= 1_000_000
    elif scale in ("billion", "bn"):
        amount *= 1_000_000_000
    mark = (hit.group("cur") or hit.group("cur2") or "EUR").upper()
    currency = {"€": "EUR", "EUR": "EUR", "EURO": "EUR", "$": "USD", "USD": "USD", "£": "GBP", "GBP": "GBP"}.get(mark, "EUR")
    return amount, currency


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
    no_proc = _stated(_NO_PROC, summary), _stated(_NO_PROC, reason)
    opened = _stated(_OPEN, summary), _stated(_OPEN, reason)
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
    if not any(re.search(rf"\b{re.escape(name)}\b", text) for name in names):
        return text.strip()
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


def publish_reason(summary: str, reason: str, public: bool = True, stage: str | None = None) -> str:
    """The interpretation to store. Empty when it contradicts the summary or the record's stage."""
    text = neutralize(reason) if public else (reason or "").strip()
    facts = neutralize(summary)
    if contradicts(facts, text) or restates(facts, text) or lifecycle_conflict(stage, text):
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
    assert not contradicts(
        "The announcement gives no tender details.",
        "No tender or call is open yet. Watch the ministry's notices.",
    )
    assert not contradicts(
        "The product has been awarded a supply contract. This is not a public procurement.",
        "This is not a procurement opportunity for an outside supplier.",
    )
    assert contradicts("The buyer is Brno University Hospital.", "The buyer is the Ministry of Defence.")
    assert publish_reason("Bids closed on 1 March 2026.", "This is an open tender for waste collection.", stage="closed") == ""
    assert publish_reason("The deadline passed in 2024.", "This is a live framework contract tender for waste collection.", stage="closed") == ""
    assert lifecycle_conflict("closed", "This is not a live tender.") is False
    kept = publish_reason(
        "The buyer awarded a waste-collection contract in 2024.",
        "The award shows what this buyer has purchased. A renewal could follow the contract term.",
        stage="closed",
    )
    assert "renewal" in kept
    assert stated_value("The estimated value is €15,659,714.03 excluding VAT.") == (15659714.03, "EUR")
    assert stated_value("an indicative budget of EUR 194.92 million") == (194_920_000.0, "EUR")
    assert stated_value("References must each be worth EUR 200,000.") is None
