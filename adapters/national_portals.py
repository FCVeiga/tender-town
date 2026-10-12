"""
National procurement portals and EBRD, searched per scope.

Each one was checked live on 2026-10-12. No API key.

  Contracts Finder     POST /api/rest/2/search_notices/json   keyword, below-threshold UK
  Find a Tender        GET  /api/1.0/ocdsReleasePackages      recent UK notices, filtered here
  Public Contracts Scotland  GET /v1/Notices                  recent Scottish notices, filtered here
  BOAMP                ODS records API, search(objet, phrase)  France, below TED
  TenderNed            public JSON /v2/publicaties            Netherlands, no account
  EBRD ECEPP           public notice index HTML               one download, filtered here

Italy (ANAC), Ireland (eTenders), Denmark (udbud.dk), Wales, Northern Ireland,
EIB and AfDB had no working keyless feed that day. IDB's open CSV stopped at
2025-10-03, so it is not a live notice feed. Above-threshold EU notices,
including Italy, still come through TED.
"""
from datetime import date, datetime, timedelta
import html
import re
from typing import Optional

import requests

from .web_search import SearchProvider, SearchResult

_UA = "TenderTown/1.0 (+https://tendertown.io)"
_LOOKBACK_DAYS = 120
_PAGE = 8
_STOP = {"and", "the", "for", "with", "from", "that", "this", "des", "les", "une", "pour", "dans", "van", "het", "een"}
# Accents, or a word that appears in the French phrase and not in the English one.
_FR = re.compile(
    r"[àâäéèêëïîôùûüç]"
    r"|\b(?:artificielle|informatique|informatiques|nuage|souverain|reconnaissance|faciale"
    r"|borne|recharge|progiciel|gestion|serveurs|potable|ordinateur|portefeuille)\b",
    re.I,
)


def french_phrase(phrases: list) -> Optional[str]:
    """The French line from a scope's TED phrases. BOAMP's object search
    does not match English."""
    for phrase in phrases or []:
        if phrase and _FR.search(phrase):
            return phrase
    return None


def _plain(value) -> str:
    if isinstance(value, dict):
        value = value.get("en") or next(iter(value.values()), "")
    text = html.unescape(str(value or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _clip(text: str, n: int = 420) -> str:
    text = _plain(text)
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def _iso(value) -> Optional[str]:
    text = _plain(value)[:32]
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return text[:10]
    match = re.match(r"(\d{2})/(\d{2})/(\d{4})", text)
    if match:
        day, month, year = match.groups()
        return f"{year}-{month}-{day}"
    return None


def _fresh(value, days: int = _LOOKBACK_DAYS) -> bool:
    iso = _iso(value)
    if not iso:
        return False
    try:
        published = datetime.strptime(iso, "%Y-%m-%d").date()
    except ValueError:
        return False
    return (date.today() - published).days <= days


def _tokens(query: str) -> list:
    parts = [p for p in re.findall(r"[\w]{3,}", (query or "").lower(), flags=re.UNICODE) if p not in _STOP]
    return parts or [p for p in [(query or "").lower().strip()] if p]


def _matches(query: str, *texts) -> bool:
    blob = " ".join(_plain(t) for t in texts).lower()
    return all(token in blob for token in _tokens(query))


class _Portal(SearchProvider):
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": _UA, "Accept": "application/json"})

    def fetch(self, url):
        return ""

    def download(self, url, dest_path):
        return dest_path


class _CachedPortal(_Portal):
    """Download the recent window once per run, then filter it per scope."""

    def __init__(self, limit: int = _PAGE):
        super().__init__()
        self.limit = limit
        self._cache = None
        self._error = None

    def _load(self) -> list:
        raise NotImplementedError

    def _corpus(self) -> list:
        if self._error:
            raise self._error
        if self._cache is None:
            try:
                self._cache = self._load()
            except Exception as exc:
                self._error = exc
                raise
        return self._cache

    def search(self, query, country=None, language="en", date_from=None):
        if not (query or "").strip():
            return []
        hits = [row for row in self._corpus() if _matches(query, row.title, row.snippet)]
        hits.sort(key=lambda row: row.published_date or "", reverse=True)
        return hits[: self.limit]


def _result(title, url, snippet, published, domain, country=None) -> Optional[SearchResult]:
    title, url = _plain(title), (url or "").strip()
    if not title or not url or not _fresh(published):
        return None
    return SearchResult(
        title=title, url=url, snippet=_clip(snippet),
        published_date=_iso(published), source_domain=domain, country=country,
    )


class ContractsFinderSearchProvider(_Portal):
    """UK below-threshold notices. Keyword search is the POST, not the OCDS GET."""

    def search(self, query, country=None, language="en", date_from=None):
        query = (query or "").strip()
        if not query:
            return []
        resp = self.session.post(
            "https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json",
            json={"searchCriteria": {"keyword": query, "statuses": ["Open"], "types": ["Contract"]}, "size": _PAGE},
            timeout=30,
        )
        resp.raise_for_status()
        results = []
        for entry in resp.json().get("noticeList") or []:
            item = entry.get("item") or {}
            notice_id = item.get("id")
            row = _result(
                item.get("title"),
                f"https://www.contractsfinder.service.gov.uk/Notice/{notice_id}" if notice_id else "",
                f"Buyer: {item.get('organisationName') or 'n/a'}. "
                f"{item.get('noticeType') or 'Contract'}. {item.get('description') or ''}",
                item.get("publishedDate"), "www.contractsfinder.service.gov.uk", "UK",
            )
            if row:
                results.append(row)
        return results


class FindATenderSearchProvider(_CachedPortal):
    """UK above-threshold notices since 2021. The OCDS feed has no keyword parameter."""

    def _load(self):
        start = (date.today() - timedelta(days=21)).isoformat() + "T00:00:00"
        url = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages"
        params = {"limit": 100, "stages": "tender", "updatedFrom": start}
        rows = []
        for _ in range(5):
            resp = self.session.get(url, params=params, timeout=45)
            resp.raise_for_status()
            data = resp.json()
            for rel in data.get("releases") or []:
                tender = rel.get("tender") or {}
                notice_id = rel.get("id")
                buyer = (rel.get("buyer") or {}).get("name")
                row = _result(
                    tender.get("title"),
                    f"https://www.find-tender.service.gov.uk/Notice/{notice_id}" if notice_id else "",
                    f"Buyer: {buyer or 'n/a'}. {tender.get('description') or ''}",
                    rel.get("date"), "www.find-tender.service.gov.uk", "UK",
                )
                if row:
                    rows.append(row)
            nxt = (data.get("links") or {}).get("next") if isinstance(data.get("links"), dict) else None
            if not nxt:
                break
            url, params = nxt, None
        return rows


class ScotlandSearchProvider(_CachedPortal):
    """Public Contracts Scotland. On 2026-10-12 the list ignored dateFrom and
    returned the latest contract notices (about two weeks). The dates stay,
    so a wider window is picked up if the API starts honouring them."""

    def _load(self):
        start = (date.today() - timedelta(days=_LOOKBACK_DAYS)).isoformat()
        resp = self.session.get(
            "https://api.publiccontractsscotland.gov.uk/v1/Notices",
            params={"noticeType": 2, "outputType": 0, "dateFrom": start, "dateTo": date.today().isoformat()},
            timeout=45,
        )
        resp.raise_for_status()
        rows = []
        for rel in resp.json().get("releases") or []:
            tender = rel.get("tender") or {}
            release_id = rel.get("id") or ""
            site_id = release_id.split("-", 2)[-1] if release_id.startswith("rls-") else ""
            url = (
                f"https://www.publiccontractsscotland.gov.uk/search/show/search_view.aspx?ID={site_id}"
                if site_id else ""
            )
            buyer = (rel.get("buyer") or {}).get("name")
            row = _result(
                tender.get("title"), url,
                f"Buyer: {buyer or 'n/a'}. {tender.get('description') or ''}",
                rel.get("date"), "www.publiccontractsscotland.gov.uk", "UK",
            )
            if row:
                rows.append(row)
        return rows


class BoampSearchProvider(_Portal):
    """France. search(objet, …) is the filter; the plain q parameter is ignored."""

    def search(self, query, country=None, language="en", date_from=None):
        phrase = re.sub(r'["\\]', " ", query or "").strip()
        if not phrase:
            return []
        resp = self.session.get(
            "https://www.boamp.fr/api/explore/v2.1/catalog/datasets/boamp/records",
            params={"where": f'search(objet,"{phrase}")', "limit": _PAGE, "order_by": "dateparution desc"},
            timeout=30,
        )
        resp.raise_for_status()
        results = []
        for rec in resp.json().get("results") or []:
            notice_id = rec.get("idweb")
            row = _result(
                rec.get("objet"),
                f"https://www.boamp.fr/pages/avis/?q=idweb:{notice_id}" if notice_id else "",
                f"Buyer: {rec.get('nomacheteur') or 'n/a'}.",
                rec.get("dateparution"), "www.boamp.fr", "FR",
            )
            if row:
                results.append(row)
        return results


class TenderNedSearchProvider(_Portal):
    """Netherlands. `search` is the keyword; the newest page is filtered here
    because relevance order buries today's notices."""

    def __init__(self):
        super().__init__()
        self._recent = None
        self._recent_error = None

    def _latest(self):
        if self._recent_error:
            raise self._recent_error
        if self._recent is None:
            try:
                resp = self.session.get(
                    "https://www.tenderned.nl/papi/tenderned-rs-tns/v2/publicaties",
                    params={"page": 0, "size": 40}, timeout=30,
                )
                resp.raise_for_status()
                self._recent = [row for row in (_tn(item) for item in resp.json().get("content") or []) if row]
            except Exception as exc:
                self._recent_error = exc
                raise
        return self._recent

    def search(self, query, country=None, language="en", date_from=None):
        query = (query or "").strip()
        if not query:
            return []
        resp = self.session.get(
            "https://www.tenderned.nl/papi/tenderned-rs-tns/v2/publicaties",
            params={"search": query, "page": 0, "size": 20}, timeout=30,
        )
        resp.raise_for_status()
        found = {}
        for item in resp.json().get("content") or []:
            row = _tn(item)
            if row:
                found[row.url] = row
        for row in self._latest():
            if row.url not in found and _matches(query, row.title, row.snippet):
                found[row.url] = row
        results = list(found.values())
        results.sort(key=lambda row: row.published_date or "", reverse=True)
        return results[:_PAGE]


def _tn(item: dict) -> Optional[SearchResult]:
    kind = (item.get("typePublicatie") or {}).get("code")
    if kind == "VBE":  # early termination, not an opportunity
        return None
    link = item.get("link") or {}
    url = link.get("href") if isinstance(link, dict) else ""
    buyer = item.get("opdrachtgeverNaam")
    label = (item.get("typePublicatie") or {}).get("omschrijving") or kind or "notice"
    return _result(
        item.get("aanbestedingNaam"), url,
        f"Buyer: {buyer or 'n/a'}. {label}. {item.get('opdrachtBeschrijving') or ''}",
        item.get("publicatieDatum"), "www.tenderned.nl", "NL",
    )


class EbrdSearchProvider(_CachedPortal):
    """ECEPP publishes the notice index as HTML. There is no JSON API."""

    def _load(self):
        resp = self.session.get(
            "https://ecepp.ebrd.com/delta/noticeSearchResults.html",
            params={"locale": "en"}, timeout=60,
            headers={"Accept": "text/html"},
        )
        resp.raise_for_status()
        rows = []
        for chunk in re.findall(r"<tr>(.*?)</tr>", resp.text, flags=re.S | re.I):
            link = re.search(
                r'href="(viewNotice\.html\?displayNoticeId=\d+)"[^>]*>([^<]+)</a>',
                chunk, flags=re.I,
            )
            published = re.search(r"(\d{2}/\d{2}/\d{4})", chunk)
            if not link or not published:
                continue
            kind = re.search(r"</a></td>\s*<td>\s*([^<]+?)\s*</td>", chunk, flags=re.I)
            row = _result(
                link.group(2),
                "https://ecepp.ebrd.com/delta/" + link.group(1),
                f"{_plain(kind.group(1)) if kind else 'Notice'}. {_plain(chunk)}",
                published.group(1), "ecepp.ebrd.com",
            )
            if row:
                rows.append(row)
        return rows


def portal_providers():
    """(source_id, provider, query language). One instance each, so the
    downloads are shared across scopes. `any` uses the scope's English term."""
    return [
        ("UK-001", ContractsFinderSearchProvider(), "en"),
        ("EU-024", FindATenderSearchProvider(), "any"),
        ("UK-002", ScotlandSearchProvider(), "any"),
        ("EU-023", BoampSearchProvider(), "fr"),
        ("EU-022", TenderNedSearchProvider(), "nl"),
        ("INTL-029", EbrdSearchProvider(), "any"),
    ]
