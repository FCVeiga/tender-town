"""
World Bank procurement notices adapter.

CONFIRMED (2026-09 research pass): fully open, keyless public API.
Endpoint: https://search.worldbank.org/api/v2/procnotices
Data license: CC BY 4.0 (World Bank Group). Best single source for
Africa/LatAm coverage — one consistent feed across 100+ borrowing countries.
"""
from datetime import datetime
from typing import Optional
import requests

from .web_search import SearchProvider, SearchResult

_WB_API_BASE = "https://search.worldbank.org/api/v2/procnotices"


class WorldBankAdapter:
    def __init__(self, session: Optional[requests.Session] = None):
        self.session = session or requests.Session()

    def search(self, keyword: Optional[str] = None, country: Optional[str] = None,
               rows: int = 50) -> list[dict]:
        params = {"format": "json", "rows": rows}
        if keyword:
            params["qterm"] = keyword
        if country:
            params["countryname_exact"] = country
        resp = self.session.get(_WB_API_BASE, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        notices = data.get("procnotices", {})
        if isinstance(notices, dict):
            notices = list(notices.values())
        return [
            {
                "notice_id": n.get("id") or n.get("notice_id"),
                "title": n.get("bid_description") or n.get("project_name", ""),
                "country": n.get("country") or n.get("countryname"),
                "project_id": n.get("project_id"),
                "project_name": n.get("project_name"),
                "notice_type": n.get("notice_type"),
                "notice_date": n.get("notice_date") or n.get("noticedate"),
                "deadline": n.get("submission_deadline_date") or n.get("deadline_date"),
                "url": f"https://projects.worldbank.org/en/projects-operations/procurement-detail/{n.get('id', '')}",
            }
            for n in notices
            if n.get("id")
        ]


def _iso_date(value) -> Optional[str]:
    if not value:
        return None
    text = str(value).strip()
    if len(text) >= 10 and text[4] == "-":
        return text[:10]
    try:
        return datetime.strptime(text, "%d-%b-%Y").strftime("%Y-%m-%d")
    except ValueError:
        return None


class WorldBankSearchProvider(SearchProvider):
    """One keyword against the procurement-notices API. Used per scope, so a
    water scope does not inherit an AI scope's hits."""

    def __init__(self, rows: int = 8):
        self.rows = rows
        self.adapter = WorldBankAdapter()

    def search(self, query, country=None, language="en", date_from=None):
        results = []
        for n in self.adapter.search(keyword=query, country=country, rows=self.rows):
            title = (n.get("title") or "").strip()
            if not title or not n.get("notice_id"):
                continue
            snippet = (
                f"Buyer: World Bank. Country: {n.get('country') or 'n/a'}. "
                f"Project: {n.get('project_name') or 'n/a'}. "
                f"Notice type: {n.get('notice_type') or 'n/a'}. "
                f"Notice date: {n.get('notice_date') or 'n/a'}."
            )
            results.append(SearchResult(
                title=title, url=n["url"], snippet=snippet,
                published_date=_iso_date(n.get("notice_date")),
                source_domain="projects.worldbank.org",
            ))
        return results

    def fetch(self, url):
        return ""

    def download(self, url, dest_path):
        return dest_path
