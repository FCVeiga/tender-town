"""
TED (Tenders Electronic Daily) adapter.

CONFIRMED (2026-09 research pass): TED's public API v3 is genuinely open —
no API key, login, or auth required to read published notices. Official
docs: https://docs.ted.europa.eu/api/. Auth is only required for
submission-related workflows, not our use case (spec section 5, Tier 1).

The search endpoint is POST-only and takes TED "expert search" syntax.
Always search quoted phrases (FT~"identity wallet"): bare terms like eIDAS
match tens of thousands of notices through e-signature boilerplate.
"""
import hashlib
import re
import time
from datetime import datetime, timedelta
from typing import Optional

import requests

from .web_search import SearchProvider, SearchResult

_TED_API_BASE = "https://api.ted.europa.eu/v3/notices/search"
_FIELDS = [
    "notice-title", "buyer-name", "buyer-country", "notice-type",
    "publication-date", "deadline-receipt-tender-date-lot", "links",
    "deadline-receipt-request-date-lot",  # restricted / competitive dialogue: requests to participate
    "procedure-identifier",  # stable across every notice of one procurement
]

# eForms XML elements holding the dates that decide whether a notice is open.
_XML_DEADLINES = ("TenderSubmissionDeadlinePeriod", "ParticipationRequestReceptionPeriod",
                  "AnswerReceptionPeriod")  # last one: market consultation answers


def _pick_lang(value, lang="eng"):
    """TED returns multilingual fields as {"eng": [...], "deu": [...]} or {"eng": "..."}."""
    if not isinstance(value, dict) or not value:
        return value or ""
    v = value.get(lang) or next(iter(value.values()))
    return v[0] if isinstance(v, list) and v else (v or "")


class TedSearchProvider(SearchProvider):
    def __init__(self, session: Optional[requests.Session] = None,
                 lookback_days: int = 120, limit: int = 50):
        self.session = session or requests.Session()
        self.lookback_days = lookback_days
        self.limit = limit

    def search(self, query, country=None, language="en", date_from=None):
        date_from = date_from or (datetime.utcnow() - timedelta(days=self.lookback_days))
        expert = f'FT~"{query.strip(chr(34))}" AND PD>={date_from.strftime("%Y%m%d")}'
        if country:
            expert += f" AND buyer-country={country}"
        for attempt in range(4):  # TED rate-limits bursts with 429
            resp = self.session.post(_TED_API_BASE, json={
                "query": expert, "fields": _FIELDS, "limit": self.limit,
            }, timeout=30)
            if resp.status_code != 429:
                break
            time.sleep(int(resp.headers.get("Retry-After", 0)) or 2 ** (attempt + 1))
        resp.raise_for_status()
        results = []
        for n in resp.json().get("notices", []):
            pub_no = n.get("publication-number", "")
            buyer = _pick_lang(n.get("buyer-name"))
            countries = n.get("buyer-country") or []
            deadlines = (n.get("deadline-receipt-tender-date-lot")
                         or n.get("deadline-receipt-request-date-lot") or [])
            # Machine-read by run_daily.ted_meta(): keep these labels stable.
            snippet = (f"Buyer: {buyer}. Notice type: {n.get('notice-type', '')}. "
                       f"Tender deadline: {deadlines[0] if deadlines else 'n/a'}. "
                       f"TED notice {pub_no}. TED procedure: {n.get('procedure-identifier') or 'n/a'}.")
            results.append(SearchResult(
                title=_pick_lang(n.get("notice-title")),
                url=f"https://ted.europa.eu/en/notice/-/detail/{pub_no}",
                snippet=snippet,
                published_date=n.get("publication-date"),
                country=countries[0] if countries else None,
            ))
        return results

    def notice_dates(self, publication_number: str) -> dict:
        """Read deadline and planned date from the notice's eForms XML, for
        notices whose search fields carry no deadline (e.g. market
        consultations, prior information notices)."""
        resp = self.session.get(f"https://ted.europa.eu/en/notice/{publication_number}/xml", timeout=30)
        resp.raise_for_status()
        xml = resp.text

        def end_dates(tag):
            return re.findall(rf"<[\w:]*{tag}>.*?<cbc:EndDate>(\d{{4}}-\d{{2}}-\d{{2}})", xml, re.S)

        deadlines = sorted(d for tag in _XML_DEADLINES for d in end_dates(tag))
        planned = re.search(r"<cbc:PlannedDate>(\d{4}-\d{2}-\d{2})", xml)
        awarded = bool(re.search(r"<cbc:NoticeTypeCode[^>]*>\s*(?:can-|veat)", xml))
        return {"deadline": deadlines[-1] if deadlines else None,
                "planned_date": planned.group(1) if planned else None,
                "awarded": awarded}

    def notice_details(self, publication_number: str) -> dict:
        """Substance of a notice from its eForms XML: estimated value,
        duration, contract nature and the procurement/lot descriptions."""
        resp = self.session.get(f"https://ted.europa.eu/en/notice/{publication_number}/xml", timeout=30)
        resp.raise_for_status()
        xml = resp.text

        # Descriptions in English if the notice has any, else the original language.
        found = [(lang, re.sub(r"\s+", " ", t).strip()) for lang, t in
                 re.findall(r'<cbc:Description(?: [^>]*languageID="(\w+)")?[^>]*>(.*?)</cbc:Description>', xml, re.S)]
        english = [t for lang, t in found if lang == "ENG"]
        descriptions = english or [t for _, t in found]

        value = re.search(r'<cbc:EstimatedOverallContractAmount currencyID="(\w+)">([\d.]+)<', xml)
        duration = re.search(r'<cbc:DurationMeasure unitCode="(\w+)">([\d.]+)<', xml)
        months = None
        if duration:
            n = float(duration.group(2))
            months = round({"MONTH": n, "YEAR": n * 12, "DAY": n / 30}.get(duration.group(1), n))
        nature = re.search(r'<cbc:ProcurementTypeCode listName="contract-nature">(\w+)<', xml)
        seen, details = set(), []
        for t in descriptions:
            key = t.lower()[:80]
            if len(t) > 25 and not t.startswith("http") and key not in seen:
                seen.add(key)
                details.append(t[:600])
        return {
            "value": float(value.group(2)) if value else None,
            "currency": value.group(1) if value else None,
            "duration_months": months,
            "contract_nature": nature.group(1) if nature else None,
            "details": details[:6],
        }

    # eForms change-corrig-justification codes
    CHANGE_REASONS = {
        "cor-buy": "correction by the buyer", "cor-esen": "correction by the eSender",
        "cor-pub": "correction by the Publications Office", "info-release": "information released",
        "update-add": "additional information", "technical": "technical correction",
        "cancel": "procedure cancelled",
    }

    def notice_changes(self, publication_number: str):
        """What a change notice says it changed (eForms <efac:Changes>), in the
        notice's own language: reason, description, whether the procurement
        documents changed. None for notices that aren't change notices."""
        resp = self.session.get(f"https://ted.europa.eu/en/notice/{publication_number}/xml", timeout=30)
        resp.raise_for_status()
        block = re.search(r"<efac:Changes>(.*?)</efac:Changes>", resp.text, re.S)
        if not block:
            return None
        b = block.group(1)
        texts = lambda tag: [re.sub(r"\s+", " ", t).strip() for t in re.findall(rf"<efbc:{tag}[^>]*>(.*?)</efbc:{tag}>", b, re.S)]
        code = re.search(r"<cbc:ReasonCode[^>]*>([\w-]+)<", b)
        docs = re.search(r"<efbc:ProcurementDocumentsChangeIndicator>(\w+)<", b)
        return {
            "reason_code": code.group(1) if code else None,
            "reason": self.CHANGE_REASONS.get(code.group(1)) if code else None,
            "reason_text": " ".join(texts("ReasonDescription")) or None,
            "changes": " ".join(texts("ChangeDescription")) or None,
            "documents_changed": bool(docs and docs.group(1) == "true"),
        }

    def fetch(self, url: str) -> str:
        resp = self.session.get(url, timeout=30)
        resp.raise_for_status()
        return resp.text

    def download(self, url: str, dest_path: str) -> str:
        resp = self.session.get(url, timeout=60, stream=True)
        resp.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        return dest_path

    @staticmethod
    def hash_document(path: str) -> str:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return h.hexdigest()
