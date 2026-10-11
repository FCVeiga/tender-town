"""Dates the pipeline has already got wrong, corrected from the regulation.

A write-up often says member states must offer a wallet by 31 December 2026.
Article 5a(1) of Regulation (EU) 2024/1183 gives them 24 months from the entry
into force of the implementing acts (EU) 2024/2977, 2024/2978, 2024/2979,
2024/2981 and 2024/2982. Those acts were published on 4 December 2024 and
entered into force on the twentieth day, 24 December 2024, so the date is
24 December 2026. Germany's d-you wallet launches in January 2027; one outlet
printed 2026.
"""
import re

_WALLET_DAY = re.compile(r"\b31\s+dec(?:ember)?\s+2026\b", re.I)
_NEAR = re.compile(r"member|offer|provid|deadline|article\s*5a|must", re.I)
_DYOU_BEFORE = re.compile(r"(d-?you\b.{0,80}?)january\s+2026\b", re.I)
_DYOU_AFTER = re.compile(r"\bjanuary\s+2026\b(.{0,80}?d-?you\b)", re.I)


def correct_known_facts(text: str) -> str:
    if not text or not re.search(r"wallet|d-?you", text, re.I):
        return text or ""

    def wallet_day(match: re.Match) -> str:
        window = text[max(0, match.start() - 90): match.end() + 90]
        if _NEAR.search(window):
            return "24 Dec 2026"
        return match.group(0)

    out = _WALLET_DAY.sub(wallet_day, text)
    out = _DYOU_BEFORE.sub(lambda m: m.group(1) + "January 2027", out)
    out = _DYOU_AFTER.sub(lambda m: "January 2027" + m.group(1), out)
    return out
