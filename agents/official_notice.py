"""
When a tender was found on a news page rather than a procurement portal,
look up the call and attach the official notice: portal link, deadline,
value and the buyer's documents.

A match needs a reference code, a portal link, or one TED notice whose title
is the same purchase. The news URL is kept as another source. The public
summary is rewritten when it still describes a different deadline or an open call.
"""
import hashlib
import html as html_lib
import os
import re
from datetime import datetime, timedelta
from io import BytesIO
from urllib.parse import quote, unquote, urljoin, urlparse

import requests
from sqlalchemy import text

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 TenderTown/1.0"}
SEDIA = "https://api.tech.ec.europa.eu/search-api/prod/rest/search"
TED_SEARCH = "https://api.ted.europa.eu/v3/notices/search"
_PORTALS = (
    "ted.europa.eu", "contractsfinder.service.gov.uk", "find-tender.service.gov.uk",
    "publiccontractsscotland.gov.uk", "boamp.fr", "tenderned.nl", "ecepp.ebrd.com",
    "bbg.gv.at", "publicprocurement.be", "aop.bg", "simap.ch", "eprocurement.gov.cy",
    "portal-vz.cz", "udbud.dk", "ethics.dk", "riigihanked.riik.ee", "contrataciondelestado.es",
    "hankintailmoitukset.fi", "eaadhsy.gr", "javnanabava.hr", "kozbeszerzes.hu",
    "etenders.gov.ie", "utbodsvefur.is", "anticorruzione.it", "vpt.lt", "marches.public.lu",
    "iub.gov.lv", "contracts.gov.mt", "doffin.no", "uzp.gov.pl", "base.gov.pt",
    "e-licitatie.ro", "upphandlingsmyndigheten.se", "enarocanje.si", "uvo.gov.sk",
    "op.europa.eu", "ungm.org",
)
# TED's buyer-country filter is ISO 3166-1 alpha-3.
_ISO3 = {
    "AT": "AUT", "AU": "AUS", "BA": "BIH", "BD": "BGD", "BE": "BEL", "BG": "BGR", "BR": "BRA",
    "CH": "CHE", "CI": "CIV", "CY": "CYP", "CZ": "CZE", "DE": "DEU", "DK": "DNK", "EE": "EST",
    "ES": "ESP", "FI": "FIN", "FR": "FRA", "GB": "GBR", "GR": "GRC", "HR": "HRV", "HU": "HUN",
    "IE": "IRL", "IN": "IND", "IT": "ITA", "LT": "LTU", "LU": "LUX", "LV": "LVA", "MK": "MKD",
    "MT": "MLT", "MY": "MYS", "NL": "NLD", "NO": "NOR", "PL": "POL", "PT": "PRT", "RO": "ROU",
    "SA": "SAU", "SE": "SWE", "SI": "SVN", "SK": "SVK", "TN": "TUN", "TR": "TUR", "UA": "UKR",
    "UK": "GBR", "US": "USA", "ZA": "ZAF",
}
# A headline word that does not name a particular purchase.
_GENERIC = {
    "digital", "identity", "wallet", "wallets", "european", "europe", "national", "public",
    "tender", "tenders", "procurement", "system", "systems", "service", "services", "project",
    "programme", "program", "government", "call", "open", "plan", "plans", "planned", "update",
    "news", "launch", "launches", "launched", "about", "after", "before", "their", "this",
    "that", "will", "have", "been", "more", "than", "rollout", "prepares", "prepare", "across",
    "scheme", "framework", "infrastructure", "backend", "operation", "operations",
    "development", "platform", "contract", "contracts", "notice", "market", "global",
    "announces", "announced", "seeks", "seeking", "first", "next", "under", "with", "from",
    "into", "over", "croatia", "germany", "finland", "france", "spain", "italy", "poland",
    "sweden", "norway", "ireland", "portugal", "romania", "greece", "belgium", "austria",
    "netherlands", "denmark", "estonia", "latvia", "lithuania", "malta", "cyprus", "hungary",
}
_CODE = re.compile(r"\b[A-Z][A-Z0-9]{1,24}(?:[/-][A-Z0-9]{1,24}){2,8}\b")
_CFT = re.compile(r"tender-details/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-[A-Za-z0-9]+)?", re.I)
_TED_PUB = re.compile(r"/(\d{5,7}-\d{4})(?:[/?#]|$)")
_DOC_TYPES = {
    "tender specifications": "TENDER_SPECIFICATIONS",
    "financial offer form": "FINANCIAL_PROPOSAL",
    "invitation letter": "CONTRACT_NOTICE",
    "draft contract": "CONTRACT",
}
# The call's own requirements file, rather than an article about it.
_REQUIREMENT_FILE = re.compile(r"\.(pdf|docx?|xlsx?|odt|zip)(?:$|[?#&])", re.I)
_TENDER_CATEGORIES = ("rfp", "rfi", "grant")


def _host(url: str) -> str:
    return urlparse(url or "").netloc.lower().removeprefix("www.")


def _portal_host(host: str) -> bool:
    """The host, or a subdomain of it (a portal's file CDN)."""
    return any(host == portal or host.endswith("." + portal) for portal in _PORTALS)


def is_portal_url(url: str) -> bool:
    """A notice on a procurement portal, not a news page that mentions one."""
    if not url:
        return False
    if _CFT.search(url):
        return True
    host = _host(url)
    if host == "ted.europa.eu" or host.endswith(".ted.europa.eu"):
        return bool(_TED_PUB.search(url))
    parsed = urlparse(url)
    if re.search(r"\.(css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|map|ttf)$", parsed.path, re.I):
        return False
    # ePPS (Ireland, Malta, Cyprus, …) is the same notice application on each country's host.
    if "/epps/" in parsed.path and re.search(r"\d", (parsed.query or "") + parsed.path):
        return True
    # EU agencies publish the call on their own site, under /procurement/.
    if host.endswith(".europa.eu") and "/procurement/" in parsed.path.lower():
        return True
    # The notice id is often in the query (etenders resourceId) or the hash
    # (ETHICS public material), not the path.
    if parsed.path in ("", "/") and not parsed.fragment:
        return False
    ident = f"{parsed.path}?{parsed.query}#{parsed.fragment}"
    return _portal_host(host) and bool(re.search(r"\d", ident))


def is_official_call(url: str, reference: str = None) -> bool:
    """A procurement or grant notice, or the file that states its requirements.

    A news article about a call is neither, until a notice or the requirement
    documents are attached.
    """
    if (reference or "").startswith("TED:"):
        return True
    if is_portal_url(url or ""):
        return True
    parsed = urlparse(url or "")
    return bool(_REQUIREMENT_FILE.search(f"{parsed.path}?{parsed.query}"))


def has_requirement_documents(session, opportunity_id: str) -> bool:
    """Files of the procedure or the grant, not a mention of them in the press."""
    return session.execute(text(
        "select 1 from documents where opportunity_id = :o limit 1"
    ), {"o": opportunity_id}).first() is not None


def release_unofficial(session) -> list:
    """A tender with no official notice and no requirement documents becomes a signal.

    Returns the ids changed. The caller commits.
    """
    from database.models import Opportunity
    changed = []
    rows = session.query(Opportunity).filter(
        Opportunity.opportunity_type.in_(_TENDER_CATEGORIES),
        Opportunity.status != "REJECTED",
    ).all()
    for opp in rows:
        if is_official_call(opp.official_url or "", opp.reference):
            continue
        if has_requirement_documents(session, opp.opportunity_id):
            continue
        opp.opportunity_type = "signal"
        if opp.status == "OPEN":
            opp.status = "SIGNAL"
        changed.append(opp.opportunity_id)
    return changed


def codes_from(*parts) -> list:
    found = []
    for part in parts:
        for code in _CODE.findall(part or ""):
            if any(ch.isdigit() for ch in code) and len(code) >= 10 and code not in found:
                found.append(code)
    return found[:6]


def _get(url: str) -> str:
    response = requests.get(url, headers=UA, timeout=30)
    response.raise_for_status()
    return response.text[:500_000]


def _plain(html: str) -> str:
    text = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text)


def _links(html: str, base: str) -> list:
    out = []
    for href in re.findall(r"""href=["']([^"'#]+)""", html or "", re.I):
        absolute = urljoin(base, href.strip())
        if absolute.startswith("http") and absolute not in out:
            out.append(absolute)
    return out


# A file that is the call itself, named as such. A publisher's media kit is not.
_FILE_URL = re.compile(r"\.(pdf|docx?|xlsx?|zip|odt)(?:$|[?#&])", re.I)
_BID_FILE = re.compile(
    r"bidding|bid documents?|invitation to bid|terms of reference|"
    r"request for proposal|\brfp\b|\brfq\b|solicitation|cahier des charges|pliego|ausschreibung",
    re.I,
)
_TENDER_FILE = re.compile(r"tender documents?|bidding documents?|specifications?", re.I)
_GOV_HOST = re.compile(
    r"(?:^|\.)gov(?:\.[a-z]{2})?$|(?:^|\.)gouv\.[a-z]{2}$|(?:^|\.)gob(?:\.[a-z]{2})?$|"
    r"(?:^|\.)go\.[a-z]{2}$|e\.gov\.|(?:^|\.)europa\.eu$",
    re.I,
)


def requirement_file_links(page_html: str, page_url: str) -> list:
    """Bidding files linked from the article: (url, filename).

    The news site's own files are skipped. A related headline is not a file,
    so a sidebar story cannot supply the dossier.
    """
    page_host = _host(page_url)
    found, seen = [], set()
    for href, anchor in re.findall(r"""<a\b[^>]*href=["']([^"'#]+)["'][^>]*>(.*?)</a>""", page_html or "", re.I | re.S):
        url = urljoin(page_url or "", html_lib.unescape(href.strip()))
        parsed = urlparse(url)
        host = _host(url)
        if not host or host == page_host or host.endswith("." + page_host):
            continue
        path = unquote(parsed.path + "?" + (parsed.query or ""))
        if not _FILE_URL.search(path):
            continue
        label = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", anchor)).strip()
        blob = f"{label} {path}"
        named = bool(_BID_FILE.search(blob))
        official = bool(_GOV_HOST.search(host)) and bool(_TENDER_FILE.search(blob))
        if not named and not official:
            continue
        if url in seen:
            continue
        seen.add(url)
        filename = unquote(parsed.path.rsplit("/", 1)[-1]).strip() or label or "Bidding documents"
        found.append((url, re.sub(r"\s+", " ", filename)[:500]))
    return found[:6]


def _cft_id(url: str):
    match = _CFT.search(url or "")
    if not match:
        return None
    return f"{match.group(1).lower()}-CN"


def portal_url(cft_id: str) -> str:
    return ("https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/"
            f"opportunities/tender-details/{cft_id}")


def _sedia(query: str) -> dict:
    response = requests.post(SEDIA, params={"apiKey": "SEDIA", "text": query, "pageSize": 8, "pageNumber": 1},
                             json={"languages": ["en"]}, headers=UA, timeout=40)
    response.raise_for_status()
    needle = query.lower().split("-cn")[0]
    for hit in response.json().get("results") or []:
        meta = hit.get("metadata") or {}
        if needle in str(meta.get("cftId") or "").lower() and meta.get("cftDocuments"):
            return meta
    return {}


def funding_documents(url: str) -> list:
    """Files published on an EU Funding & Tenders call: (name, type, download URL, date)."""
    cft_id = _cft_id(url)
    meta = _sedia(cft_id[:-3]) if cft_id else {}
    raw = (meta.get("cftDocuments") or [None])[0]
    if not raw:
        return []
    import json
    packed = json.loads(raw).get("cftDocuments") or []
    rows = []
    for doc in packed:
        if doc.get("obsolete"):
            continue
        current = next((item for item in doc.get("hermesDocumentReferences") or []
                        if item.get("isCurrentVersion") == "Y"), None)
        if not current or not current.get("documentFileName"):
            continue
        name = doc.get("documentTitle") or current["documentFileName"]
        kind = _DOC_TYPES.get((doc.get("documentType") or "").lower())
        if not kind and re.search(r"\bfaq\b|questions?", name, re.I):
            kind = "Q_AND_A"
        published = (current.get("publicationDate") or "")[:10] or None
        download = (portal_url(cft_id).replace("/screen/opportunities/tender-details/",
                                               "/screen/opportunities/tender-details/docs/")
                    + "/" + quote(current["documentFileName"]))
        rows.append((name, kind, download, published))
    return rows


def _ted_for_code(code: str):
    response = requests.post(TED_SEARCH, json={
        "query": f'FT~"{code}" AND PD>=20240101',
        "fields": ["publication-number", "procedure-identifier", "notice-title", "buyer-country",
                   "deadline-receipt-tender-date-lot"],
        "limit": 8,
    }, headers=UA, timeout=40)
    if response.status_code == 429:
        return None
    response.raise_for_status()
    notices = response.json().get("notices") or []
    procedures = {n.get("procedure-identifier") for n in notices if n.get("procedure-identifier")}
    if len(procedures) != 1:
        return None
    latest = sorted(notices, key=lambda n: n.get("publication-number") or "")[-1]
    return {"procedure": procedures.pop(), "publication": latest.get("publication-number")}


def _latest_publication(procedure: str):
    from agents.tender_documents import _procedure_notices
    notices = _procedure_notices(procedure)
    return notices[-1]["publication-number"] if notices else None


def _from_portal(url: str):
    cft_id = _cft_id(url)
    if not cft_id:
        if "ted.europa.eu" in url:
            match = _TED_PUB.search(url)
            return _from_ted(match.group(1)) if match else None
        return {"portal_url": url, "procedure": None, "publication": None, "title": None,
                "deadline": None, "value": None, "currency": None, "country": None}
    meta = _sedia(cft_id[:-3])
    deadline = ((meta.get("deadlineDate") or [None])[0] or "")[:10] or None
    title = (meta.get("title") or [None])[0]
    amount = (meta.get("cftEstimatedOverallContractAmount") or [None])[0]
    currency = (meta.get("cftEstimatedOverallContractCurrency") or [None])[0]
    publication = None
    try:
        publication = _latest_publication(cft_id[:-3])
    except Exception:
        publication = None
    return {
        "portal_url": portal_url(cft_id),
        "procedure": cft_id[:-3],
        "publication": publication,
        "title": title,
        "deadline": deadline,
        "value": float(amount) if amount and str(amount).replace(".", "", 1).isdigit() else None,
        "currency": currency if currency and len(str(currency)) <= 8 else None,
        "country": None,
    }


def _from_ted(publication: str, procedure: str = None):
    xml = _get(f"https://ted.europa.eu/en/notice/{publication}/xml")
    folder = re.search(r"<cbc:ContractFolderID>\s*([0-9a-f-]{36})", xml, re.I)
    procedure = procedure or (folder.group(1).lower() if folder else None)
    kind = re.search(r"<cbc:NoticeTypeCode[^>]*>\s*([a-z0-9-]+)", xml)
    notice_type = kind.group(1) if kind else ""
    awarded = notice_type.startswith(("can-", "veat"))
    portal = next((u for u in re.findall(r"<cbc:URI>([^<]+)</cbc:URI>", xml) if "tender-details/" in u), None)
    if portal:
        found = _from_portal(portal.split("#")[0])
        found["publication"] = found["publication"] or publication
        found["procedure"] = found.get("procedure") or procedure
        found["awarded"] = awarded
        found["notice_type"] = found.get("notice_type") or notice_type
        return found
    # Only the submission deadline. A later EndDate is often the contract period.
    deadlines = re.findall(r"<cac:TenderSubmissionDeadlinePeriod>.*?<cbc:EndDate>(\d{4}-\d{2}-\d{2})", xml, re.S)
    return {
        "portal_url": f"https://ted.europa.eu/en/notice/-/detail/{publication}",
        "procedure": procedure,
        "publication": publication,
        "title": None,
        "deadline": None if awarded else (deadlines[-1] if deadlines else None),
        "awarded": awarded,
        "notice_type": notice_type,
        "value": None, "currency": None, "country": None,
    }


def _hop(code: str):
    """A page that cites the code and links to the portal or to TED."""
    if not os.environ.get("TAVILY_API_KEY"):
        return None
    from adapters.tavily import TavilySearchProvider
    try:
        results = TavilySearchProvider().search(f'"{code}"')
    except Exception:
        return None
    for result in results[:8]:
        blob = f"{result.title} {result.snippet} {result.url}"
        if code.lower() not in blob.lower():
            continue
        if is_portal_url(result.url):
            return result.url
    for result in results[:3]:
        if is_portal_url(result.url):
            continue
        try:
            html = _get(result.url)
        except Exception:
            continue
        if code not in _plain(html):
            continue
        for link in _links(html, result.url):
            if is_portal_url(link):
                return link
    return None


def _name_tokens(title: str) -> list:
    """Words that can identify one purchase: a product name, not 'wallet' or 'tender'."""
    ranked = []
    seen = set()
    for word in re.findall(r"[^\W\d_](?:[^\W_]|[0-9]|-){2,}", title or ""):
        key = word.lower()
        if key in seen or key in _GENERIC:
            continue
        named = word.isupper() or any(ch.isupper() for ch in word[1:]) or any(ch.isdigit() for ch in word) or len(word) >= 8
        if not named:
            continue
        seen.add(key)
        ranked.append(((any(ch.isdigit() for ch in word), any(ch.isupper() for ch in word[1:]), len(word)), word))
    ranked.sort(reverse=True)
    return [word for _, word in ranked[:3]]


def _notice_title(notice: dict) -> str:
    title = notice.get("notice-title")
    if isinstance(title, dict):
        title = title.get("eng") or next(iter(title.values()), "")
    if isinstance(title, list):
        title = " ".join(str(part) for part in title)
    return str(title or "")


def _pub_key(publication: str):
    try:
        number, year = str(publication).split("-")
        return (int(year), int(number))
    except (ValueError, AttributeError):
        return (0, 0)


def _ted_notices(query: str):
    body = {"query": query, "fields": ["publication-number", "procedure-identifier", "notice-title", "buyer-country"], "limit": 15}
    response = requests.post(TED_SEARCH, json=body, headers=UA, timeout=40)
    if response.status_code == 429:
        import time
        time.sleep(2)
        response = requests.post(TED_SEARCH, json=body, headers=UA, timeout=40)
        if response.status_code == 429:
            return None
    response.raise_for_status()
    return response.json().get("notices") or []


def _ted_for_title(title: str, country: str = None):
    """The one TED procedure whose title is this same purchase, or None.

    A headline with no call code still gets a search. Several procedures, or
    none that read as the same purchase, are left alone.
    """
    from services.deduplicator import same_procurement
    tokens = _name_tokens(title)
    if not tokens:
        return None
    iso = _ISO3.get((country or "").upper())
    attempts = [tokens[:2]] if len(tokens) >= 2 else []
    attempts.append(tokens[:1])
    for chosen in attempts:
        parts = [f'FT~"{token}"' for token in chosen]
        if iso:
            parts.append(f"buyer-country = {iso}")
        parts.append("PD>=20240101")
        try:
            notices = _ted_notices(" AND ".join(parts))
        except Exception:
            return None
        if notices is None:
            return None
        if not notices:
            continue
        winners = {}
        for notice in notices:
            procedure = notice.get("procedure-identifier")
            publication = notice.get("publication-number")
            if not procedure or not publication or not same_procurement(title, _notice_title(notice)):
                continue
            winners.setdefault(procedure, []).append(publication)
        if len(winners) != 1:
            return None
        procedure, publications = next(iter(winners.items()))
        return {"procedure": procedure, "publication": sorted(publications, key=_pub_key)[-1]}
    return None


def find_official(source_url: str, text: str = "", country: str = None, headline: str = None,
                  follow_links: bool = True, page: str = None):
    """The portal record for a tender first seen at source_url, or None.

    follow_links is for a page that is itself about one purchase. A news
    article's sidebar can point at a different notice, so that path stays off.
    page is the article HTML when the caller already fetched it.
    """
    html = page
    if html is None:
        html = ""
        if source_url and not is_portal_url(source_url):
            try:
                html = _get(source_url)
            except Exception:
                html = ""
    for link in (_links(html, source_url or "") if follow_links else []):
        if not is_portal_url(link):
            continue
        found = _from_ted(_TED_PUB.search(link).group(1)) if _TED_PUB.search(link) and "tender-details/" not in link else _from_portal(link)
        if found and found.get("portal_url"):
            return found
    for code in codes_from(text, _plain(html)):
        try:
            ted = _ted_for_code(code)
        except Exception:
            ted = None
        if ted and ted.get("publication"):
            return _from_ted(ted["publication"], ted.get("procedure"))
        try:
            jumped = _hop(code)
        except Exception:
            jumped = None
        if not jumped:
            continue
        if _TED_PUB.search(jumped) and "tender-details/" not in jumped:
            return _from_ted(_TED_PUB.search(jumped).group(1))
        found = _from_portal(jumped)
        if found and found.get("portal_url"):
            return found
    try:
        ted = _ted_for_title(headline or text, country)
    except Exception:
        ted = None
    if ted and ted.get("publication"):
        return _from_ted(ted["publication"], ted.get("procedure"))
    return None


_STALE_CLAIM = re.compile(
    r"open until|not yet confirmed|not yet specified|not yet announced|not yet published|"
    r"no bid deadline|no deadline|deadline is not|deadline has not|has not yet been|"
    r"is running a public tender|with no (?:bid |submission )?deadline|without a confirmed",
    re.I,
)
_DATE_CLAIM = re.compile(r"deadline|open until", re.I)
_MONTHS = {name: n for n, name in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august",
     "september", "october", "november", "december"], 1)}
_LONG_DATE = re.compile(r"\b(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b")
_ISO_DATE = re.compile(r"\b(20\d{2})-(\d{2})-(\d{2})\b")
_AWARD_LEAD = "The contract has been awarded."


def _dates_in(sentence: str) -> list:
    found = []
    for day, month, year in _LONG_DATE.findall(sentence):
        number = _MONTHS.get(month.lower())
        if number:
            found.append((int(year), number, int(day)))
    for year, month, day in _ISO_DATE.findall(sentence):
        found.append((int(year), int(month), int(day)))
    return found


def _conflicts(sentence: str, deadline, awarded: bool) -> bool:
    """A sentence that states a deadline the notice does not."""
    dates = _dates_in(sentence)
    claim = bool(_STALE_CLAIM.search(sentence))
    dated = bool(dates) and bool(_DATE_CLAIM.search(sentence))
    if awarded:
        return claim or dated
    if deadline is None:
        return False
    if claim and not dates:
        return True
    when = deadline.replace(tzinfo=None) if getattr(deadline, "tzinfo", None) else deadline
    return dated and any((y, m, d) != (when.year, when.month, when.day) for y, m, d in dates)


_CLAIM = re.compile(
    r"(?:submission|tender|bid)\s+deadline\s+is\s+"
    r"|(?<![A-Za-z])deadline\s+is\s+"
    r"|submission\s+is\s+due(?:\s+(?:on|by))?\s+"
    r"|open\s+until\s+",
    re.I,
)
_STATED_DATE = re.compile(
    r"^(?:on\s+|by\s+)?"
    r"(\d{1,2}/\d{1,2}/20\d{2}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+20\d{2}|20\d{2}-\d{2}-\d{2})",
    re.I,
)
_MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july",
                "august", "september", "october", "november", "december"]


def _deadline_parts(deadline):
    if not deadline:
        return None
    if isinstance(deadline, str):
        try:
            deadline = datetime.strptime(deadline[:10], "%Y-%m-%d")
        except ValueError:
            return None
    when = deadline.replace(tzinfo=None) if getattr(deadline, "tzinfo", None) else deadline
    if not (1 <= when.month <= 12 and 1 <= when.day <= 31):
        return None
    return when.year, when.month, when.day


def _read_stated(token: str):
    slash = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(20\d{2})", token)
    if slash:
        return int(slash.group(3)), int(slash.group(2)), int(slash.group(1))
    iso = re.fullmatch(r"(20\d{2})-(\d{2})-(\d{2})", token)
    if iso:
        return int(iso.group(1)), int(iso.group(2)), int(iso.group(3))
    long = re.fullmatch(r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(20\d{2})", token, re.I)
    if not long:
        return None
    word = long.group(2).lower()
    month = next((i + 1 for i, name in enumerate(_MONTH_NAMES)
                  if name == word or (3 <= len(word) < len(name) and name.startswith(word))), None)
    if not month:
        return None
    return int(long.group(3)), month, int(long.group(1))


def _month_like(source: str, month: int) -> str:
    name = _MONTH_NAMES[month - 1]
    base = name[:3] if len(source) <= 3 else name
    if source.isupper():
        return base.upper()
    if source[:1].isupper():
        return base.capitalize()
    return base


def _ordinal(day: int) -> str:
    if 11 <= day % 100 <= 13:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")


def _format_like(token: str, when) -> str:
    year, month, day = when
    if "/" in token:
        left, mid, _year = token.split("/")
        return f"{day:0{len(left)}d}/{month:0{len(mid)}d}/{year}"
    if re.match(r"20\d{2}-", token):
        return f"{year:04d}-{month:02d}-{day:02d}"
    long = re.fullmatch(r"(\d{1,2})(st|nd|rd|th)?\s+([A-Za-z]+)\s+20\d{2}", token, re.I)
    if not long:
        return token
    shown = f"{day:0{len(long.group(1))}d}"
    suffix = _ordinal(day) if long.group(2) else ""
    return f"{shown}{suffix} {_month_like(long.group(3), month)} {year}"


def align_submission_deadline(text: str, deadline) -> str:
    """The summary, with the submission deadline it says applies now set to the stored date.

    A sentence that only recalls an earlier deadline ("the deadline was …") is left as written.
    """
    when = _deadline_parts(deadline)
    body = text or ""
    if not body or not when:
        return body
    out, cursor = [], 0
    for match in _CLAIM.finditer(body):
        before = body[max(0, match.start() - 24):match.start()].lower()
        if "clarification" in before or "question" in before:
            continue
        found = _STATED_DATE.match(body[match.end():])
        if not found:
            continue
        token = found.group(1)
        stated = _read_stated(token)
        if not stated or stated == when:
            continue
        at = match.end() + found.start(1)
        out.append(body[cursor:at])
        out.append(_format_like(token, when))
        cursor = at + len(token)
    out.append(body[cursor:])
    return "".join(out)


def summary_aligned(summary: str, status: str, deadline):
    """The summary with sentences that contradict the notice removed.

    None when the text already agrees with the record. An award leads with
    that fact, so a leftover article cannot keep another call's deadline.
    """
    text = (summary or "").strip()
    if not text or status not in ("AWARDED", "CLOSED", "OPEN"):
        return None
    awarded = status == "AWARDED"
    parts = [part for part in re.split(r"(?<=[.!?])\s+", text) if part]
    kept = [part for part in parts if not _conflicts(part, deadline, awarded)]
    if len(kept) == len(parts):
        return None
    body = " ".join(kept).strip()
    if awarded:
        if body.lower().startswith(_AWARD_LEAD.lower()):
            return body
        return f"{_AWARD_LEAD} {body}".strip() if body else _AWARD_LEAD
    return body or None


def _mark_summary(opp, summary: str):
    opp.summary = summary
    lang = dict(opp.lang or {})
    lang["summary"] = "en"
    opp.lang = lang


def _apply_notice(session, opp, found: dict, now: datetime) -> bool:
    """Write the latest notice onto the tender. A material change is a status
    or a submission deadline, which is the only thing that counts as an update."""
    from database.models import ChangeEvent, ChangeImportance
    awarded = bool(found.get("awarded"))
    old_deadline = opp.deadline.replace(tzinfo=None) if opp.deadline else None
    new_deadline = datetime.strptime(found["deadline"], "%Y-%m-%d") if found.get("deadline") and not awarded else None
    material = False
    if awarded:
        if opp.status != "AWARDED":
            session.add(ChangeEvent(
                opportunity_id=opp.opportunity_id, event_type="status", importance=ChangeImportance.MATERIAL,
                description=f"Status changed: {opp.status} → AWARDED",
                detected_at=now, notice_url=found.get("portal_url"),
                note_source="Read from the official notice"))
            material = True
        opp.status = "AWARDED"
        opp.deadline = None
        opp.status_evidence = "The contract award notice is published."
    elif new_deadline and old_deadline != new_deadline:
        verb = "extended" if old_deadline and new_deadline > old_deadline else "brought forward" if old_deadline else "set"
        old = old_deadline.strftime("%d %b %Y") if old_deadline else "none"
        session.add(ChangeEvent(
            opportunity_id=opp.opportunity_id, event_type="deadline", importance=ChangeImportance.MATERIAL,
            description=f"Deadline {verb}: {old} → {new_deadline.strftime('%d %b %Y')}",
            detected_at=now, notice_url=found.get("portal_url"),
            note_source="Read from the official notice"))
        opp.deadline = new_deadline
        opp.status = "OPEN" if new_deadline >= now else "CLOSED"
        opp.status_evidence = f"The contract notice deadline is {new_deadline.strftime('%d %B %Y').lstrip('0')}."
        material = True
    source_changed = bool(found.get("portal_url") and found["portal_url"] != opp.official_url)
    if source_changed:
        _remember(session, opp.opportunity_id, opp.official_url, opp.title)
        opp.official_url = found["portal_url"][:1024]
    if found.get("procedure"):
        opp.reference = f"TED:{found['procedure']}"[:128]
    # A press story is only a signal until this notice is the source. A prior
    # information notice stays a signal; a call becomes the tender it is.
    if source_changed and (opp.opportunity_type or "") == "signal" and is_official_call(opp.official_url or "", opp.reference):
        kind = found.get("notice_type") or ""
        if kind == "pmc":
            opp.opportunity_type = "rfi"
        elif not (kind.startswith("pin-") and not kind.startswith("pin-cfc")):
            opp.opportunity_type = "rfp"
        deadline = opp.deadline.replace(tzinfo=None) if opp.deadline else None
        if opp.opportunity_type != "signal" and opp.status == "SIGNAL" and deadline and deadline >= now:
            opp.status = "OPEN"
    if found.get("title"):
        opp.title = found["title"]
        opp.title_en = found["title"]
    if found.get("value"):
        opp.estimated_value = found["value"]
        opp.currency = found.get("currency") or opp.currency
        opp.value_source = None
    current = align_submission_deadline(opp.summary, opp.deadline)
    aligned = summary_aligned(current, opp.status or "", opp.deadline)
    if aligned and aligned != (opp.summary or "").strip():
        _mark_summary(opp, aligned)
    elif current and current != (opp.summary or "").strip():
        _mark_summary(opp, current)
    if awarded:
        opp.tender_summary = None
    else:
        revised = align_submission_deadline(opp.tender_summary, opp.deadline)
        if revised and revised != (opp.tender_summary or ""):
            opp.tender_summary = revised
    if material or source_changed:
        opp.tender_analysed_at = None
    if material:
        opp.last_change = now
    opp.last_checked = now
    opp.verified_at = now
    return material


def _remember(session, opportunity_id: str, url: str, title: str):
    if not url:
        return
    session.execute(text("""
        insert into item_sources (item_type, item_id, url, title, source_name, published_at)
        values ('tender', :i, :u, :title, :name, null)
        on conflict (item_type, item_id, url) do nothing
    """), {"i": opportunity_id, "u": url[:1024], "title": (title or "")[:500] or None,
           "name": (urlparse(url).netloc.removeprefix("www.")[:200] or None)})


_INVITATION = re.compile(
    r"Invitation to Bid for|Invitation to Tender|Call for Tenders|Appel d'offres|Pliego de",
    re.I,
)


def _pdf_excerpt(data: bytes, limit: int = 16000) -> str:
    """The invitation, which states the buyer, the price and the deadline.

    Later sections reuse words like "consumption" for a different clause, so
    the summary is read from the invitation and the pages that follow it.
    """
    from pypdf import PdfReader
    reader = PdfReader(BytesIO(data))
    start = None
    for index, page in enumerate(reader.pages[:40]):
        if _INVITATION.search(page.extract_text() or ""):
            start = index
            break
    chosen = []
    if start is not None:
        chosen = [(page.extract_text() or "") for page in reader.pages[start:start + 6]]
    if sum(len(text) for text in chosen) < 400:
        dated = re.compile(r"\d{1,2}\s+[A-Za-z]+\s+20\d{2}|\b20\d{2}-\d{2}-\d{2}\b")
        scored = []
        for index, page in enumerate(reader.pages[:90]):
            text = page.extract_text() or ""
            if len(text) < 80:
                continue
            score = 0
            if dated.search(text) and re.search(r"deadline|pre-bid|submission of bids|Approved Budget", text, re.I):
                score += 4
            if re.search(r"Approved Budget for the Contract|Component\s+1", text):
                score += 3
            if score:
                scored.append((score, index, text))
        picked = sorted(sorted(scored, key=lambda row: (-row[0], row[1]))[:8], key=lambda row: row[1])
        chosen = [text for _score, _index, text in picked]
    if not chosen:
        chosen = [(reader.pages[i].extract_text() or "") for i in range(min(6, len(reader.pages)))]
    parts, used = [], 0
    for text in chosen:
        parts.append(text)
        used += len(text)
        if used >= limit:
            break
    body = re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", "\n".join(parts)))
    return body.strip()[:limit]


def _grounded_summary(summary: str, excerpt: str) -> str:
    """Keep a sentence only when its words appear in the document text.

    A bidding file says "one (1) year". A model that turns that into a payment
    model writes words the file never uses, and those sentences are dropped.
    """
    source = excerpt.lower()
    paragraphs = []
    for para in re.split(r"\n\s*\n", (summary or "").strip()):
        kept = []
        for sentence in re.split(r"(?<=[.!?])\s+", para.strip()):
            tokens = re.findall(r"[a-z]{6,}", sentence.lower().replace("-", " "))
            missing = [token for token in tokens if token not in source and token.rstrip("s") not in source]
            if len(missing) <= 1:
                kept.append(sentence)
        if kept:
            paragraphs.append(" ".join(kept))
    return "\n\n".join(paragraphs)


def _summarize_bid(data: bytes) -> dict:
    """A public summary from the bidding file. Empty when the file has no readable text."""
    excerpt = _pdf_excerpt(data) if data.startswith(b"%PDF") else ""
    if len(excerpt) < 400:
        return {}
    from services.agent_settings import target_language
    from services.llm_client import call_llm_json, load_prompt
    language, _code = target_language()
    described = call_llm_json(
        system_prompt=load_prompt("bid_document_summary.md").replace("{language}", language),
        user_content=excerpt,
        max_tokens=1200,
    )
    if not isinstance(described, dict):
        return {}
    summary = _grounded_summary(described.get("summary") or "", excerpt)
    if re.search(r"period of one \(1\) year", excerpt, re.I) and not re.search(r"\bone year\b", summary, re.I):
        summary = summary.rstrip() + " The subscription and managed services are provided for one year."
    described["summary"] = summary
    return described


def _apply_bid_summary(opp, described: dict, now: datetime):
    """Write what the bidding file says onto the tender. The news headline stays a source."""
    from services.publication import neutralize
    summary = neutralize((described.get("summary") or "").strip())
    if summary:
        _mark_summary(opp, summary)
        opp.tender_summary = None
        opp.tender_analysed_at = None
    buyer = (described.get("buyer") or "").strip()
    if buyer and (not opp.authority or "unclear" in (opp.authority or "").lower()):
        opp.authority = buyer[:256]
        opp.authority_en = buyer[:256]
    title = re.sub(r"\s+", " ", (described.get("title") or "")).strip()
    if title and len(title) > 40:
        opp.title = title[:500]
        opp.title_en = title[:500]
    reference = (described.get("reference") or "").strip()
    if reference and not opp.reference and any(ch.isdigit() for ch in reference) and len(reference) <= 128:
        opp.reference = reference
    deadline = None
    raw_deadline = (described.get("deadline") or "")[:10]
    try:
        deadline = datetime.strptime(raw_deadline, "%Y-%m-%d") if raw_deadline else None
    except ValueError:
        deadline = None
    if deadline:
        opp.deadline = deadline
        opp.status = "OPEN" if deadline >= now else "CLOSED"
        opp.status_evidence = f"The bidding documents set the submission deadline at {deadline.strftime('%d %B %Y').lstrip('0')}."
    elif opp.status == "SIGNAL" and opp.deadline and opp.deadline.replace(tzinfo=None) >= now:
        opp.status = "OPEN"
    if opp.opportunity_type == "signal":
        opp.opportunity_type = "rfp"
    value = described.get("value")
    currency = (described.get("currency") or "").strip().upper()[:8]
    try:
        amount = float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        amount = None
    if amount and amount > 0 and currency:
        opp.estimated_value = amount
        opp.currency = currency
        opp.value_source = None


def attach_bid_documents(session, opp, page_html: str) -> int:
    """Store bidding files linked from the article and summarise the tender from them.

    Returns how many files were added. The caller commits.
    """
    links = requirement_file_links(page_html or "", opp.official_url or "")
    if not links:
        return 0
    added = []
    now = datetime.utcnow()
    for url, name in links:
        if session.execute(text("select 1 from documents where opportunity_id = :o and url = :u"),
                           {"o": opp.opportunity_id, "u": url[:1000]}).first():
            continue
        try:
            response = requests.get(url, headers=UA, timeout=60)
        except Exception:
            continue
        data = response.content or b""
        if response.status_code in (401, 403):
            from agents.tender_documents import note_gated_portal
            note_gated_portal(session, opp.opportunity_id, url)
            continue
        if response.status_code != 200 or not (data.startswith(b"%PDF") or data.startswith(b"PK")):
            continue
        doc_id = f"{opp.opportunity_id}-{hashlib.md5(f'{name}|{url}'.encode()).hexdigest()[:10]}"
        session.execute(text("""insert into documents (document_id, opportunity_id, name, document_type, url, downloaded_at)
                                values (:d, :o, :n, cast('TENDER_SPECIFICATIONS' as documenttype), :u, :now)"""),
                        {"d": doc_id, "o": opp.opportunity_id, "n": name[:500], "u": url[:1000], "now": now})
        added.append((url, name, data if data.startswith(b"%PDF") and len(data) <= 30_000_000 else b""))
    if not added:
        return 0
    _remember(session, opp.opportunity_id, opp.official_url, opp.title)
    described = {}
    for url, _name, data in added:
        if not data:
            continue
        try:
            described = _summarize_bid(data) or {}
        except Exception:
            described = {}
        if described.get("summary"):
            break
    if described:
        _apply_bid_summary(opp, described, now)
    elif opp.opportunity_type == "signal":
        opp.opportunity_type = "rfp"
        if opp.status == "SIGNAL" and opp.deadline and opp.deadline.replace(tzinfo=None) >= now:
            opp.status = "OPEN"
    return len(added)


def resolve_official(session, errors: list, only_id: str = None) -> int:
    """Attach the official portal to open tenders that were found somewhere else."""
    from database.models import Opportunity
    from agents.tender_documents import collect_documents
    query = session.query(Opportunity).filter(Opportunity.status.in_(["OPEN", "SIGNAL", "UNVERIFIED"]))
    if only_id:
        query = query.filter(Opportunity.opportunity_id == only_id)
    linked = 0
    for opp in query.all():
        has_ref = (opp.reference or "").startswith("TED:")
        if has_ref:
            continue
        # Already a portal notice (a TED PIN, for example) but with no procedure
        # id yet, so the document pass never sees it. Read the notice and collect.
        if is_portal_url(opp.official_url or ""):
            try:
                found = _from_portal(opp.official_url or "")
            except Exception as exc:
                session.rollback()
                errors.append(f"official {opp.opportunity_id}: {exc}"[:300])
                continue
            if found and found.get("procedure"):
                opp.reference = f"TED:{found['procedure']}"[:128]
                session.commit()
                try:
                    collect_documents(session, opp.opportunity_id, found["procedure"])
                    session.commit()
                except Exception as exc:
                    session.rollback()
                    errors.append(f"documents {opp.opportunity_id}: {exc}"[:300])
            continue
        page = ""
        if opp.official_url and not is_portal_url(opp.official_url):
            try:
                page = _get(opp.official_url)
            except Exception as exc:
                session.rollback()
                errors.append(f"official {opp.opportunity_id}: {exc}"[:300])
                page = ""
        try:
            found = find_official(opp.official_url or "", " ".join(
                part for part in (opp.title, opp.title_en, opp.summary) if part),
                opp.country, headline=opp.title_en or opp.title, page=page)
        except Exception as exc:
            session.rollback()
            errors.append(f"official {opp.opportunity_id}: {exc}"[:300])
            found = None
        try:
            if attach_bid_documents(session, opp, page):
                session.commit()
                linked += 1
        except Exception as exc:
            session.rollback()
            errors.append(f"bid documents {opp.opportunity_id}: {exc}"[:300])
        if not found or not found.get("portal_url") or found["portal_url"] == opp.official_url:
            continue
        _apply_notice(session, opp, found, datetime.utcnow())
        session.commit()
        if found.get("procedure"):
            try:
                collect_documents(session, opp.opportunity_id, found["procedure"])
            except Exception as exc:
                session.rollback()
                errors.append(f"documents {opp.opportunity_id}: {exc}"[:300])
        linked += 1
    return linked


def _scopes_for(session, item_type: str, item_id: str, opportunity_id: str):
    """The scopes that already carry this story also carry the tender it turned out to be."""
    session.execute(text("""
        insert into scope_items (scope_id, item_type, item_id, relevance, candidate_type, reason)
        select scope_id, 'tender', :opp, relevance, candidate_type, reason
        from scope_items
        where item_type = :kind and item_id = :item
        on conflict (scope_id, item_type, item_id) do nothing
    """), {"opp": opportunity_id, "kind": item_type, "item": item_id})


def resolve_from_news(session, errors: list, only_id: str = None, limit: int = 40) -> int:
    """A news story in any scope that is really a call becomes a tender on the official notice.

    The article stays on the news page. The tender is added to the same scopes.
    """
    from database.models import Opportunity, NewsItem
    from agents.tender_documents import collect_documents
    from services.deduplicator import fingerprint
    query = session.query(NewsItem)
    if only_id:
        query = query.filter(NewsItem.news_id == only_id)
    else:
        query = query.order_by(NewsItem.published_date.desc().nullslast(), NewsItem.created_at.desc()).limit(limit)
    linked = 0
    for item in query.all():
        if is_portal_url(item.source_url or ""):
            continue
        headline = item.title_en or item.title or ""
        try:
            found = find_official(item.source_url or "", " ".join(
                part for part in (item.title, item.title_en, item.summary) if part),
                item.country, headline=headline, follow_links=False)
        except Exception as exc:
            session.rollback()
            errors.append(f"official news {item.news_id}: {exc}"[:300])
            continue
        if not found or not found.get("portal_url"):
            continue
        reference = f"TED:{found['procedure']}" if found.get("procedure") else None
        existing = session.query(Opportunity).filter_by(reference=reference).first() if reference else None
        if not existing:
            existing = session.query(Opportunity).filter_by(official_url=found["portal_url"]).first()
        now = datetime.utcnow()
        if not existing:
            if found.get("awarded"):
                deadline, status = None, "AWARDED"
                evidence = "The contract award notice is published."
            elif found.get("deadline"):
                deadline = datetime.strptime(found["deadline"], "%Y-%m-%d")
                status = "OPEN" if deadline >= now else "CLOSED"
                evidence = f"The contract notice deadline is {deadline.strftime('%d %B %Y').lstrip('0')}."
            else:
                deadline, status, evidence = None, "UNVERIFIED", None
            summary = summary_aligned(item.summary, status, deadline) or item.summary
            opportunity_id = fingerprint(item.country or "", "", found.get("procedure"), found.get("title") or headline)
            existing = session.get(Opportunity, opportunity_id) or Opportunity(
                opportunity_id=opportunity_id, first_detected=now,
                title=found.get("title") or item.title, title_en=found.get("title") or headline,
                country=item.country, opportunity_type="rfp",
                status=status, summary=summary, deadline=deadline, publication_date=item.published_date,
                official_url=found["portal_url"][:1024], reference=reference,
                estimated_value=found.get("value"), currency=found.get("currency"),
                relevance_score=item.relevance_score or 0,
                opportunity_relevance_score=item.relevance_score or 0,
                last_checked=now, verified_at=now, status_evidence=evidence,
                lang={"summary": "en"} if summary != item.summary else None,
            )
            session.add(existing)
        else:
            _apply_notice(session, existing, found, now)
        _remember(session, existing.opportunity_id, item.source_url, headline)
        _scopes_for(session, "news", item.news_id, existing.opportunity_id)
        session.commit()
        if found.get("procedure"):
            try:
                collect_documents(session, existing.opportunity_id, found["procedure"])
            except Exception as exc:
                session.rollback()
                errors.append(f"documents {existing.opportunity_id}: {exc}"[:300])
        linked += 1
    return linked


def align_summaries(session) -> int:
    """Drop summary sentences that disagree with the status and deadline already stored."""
    from database.models import Opportunity
    changed = 0
    for opp in session.query(Opportunity).filter(Opportunity.status.in_(["AWARDED", "CLOSED", "OPEN"])).all():
        row_changed = False
        current = align_submission_deadline(opp.summary, opp.deadline)
        aligned = summary_aligned(current, opp.status or "", opp.deadline)
        if aligned and aligned != (opp.summary or "").strip():
            _mark_summary(opp, aligned)
            row_changed = True
        elif current and current != (opp.summary or "").strip():
            _mark_summary(opp, current)
            row_changed = True
        revised = align_submission_deadline(opp.tender_summary, opp.deadline)
        if revised and revised != (opp.tender_summary or ""):
            opp.tender_summary = revised
            row_changed = True
        if row_changed:
            changed += 1
    if changed:
        session.commit()
    return changed


def refresh_open(session, errors: list, limit: int = 20) -> int:
    """Re-read the latest notice of tenders that can still change.

    An award clears the bid deadline. A later contract notice moves it.
    A notice that states neither is left alone, so a failed read cannot wipe a date.
    """
    from database.models import Opportunity
    from agents.tender_documents import _procedure_notices
    now = datetime.utcnow()
    open_cutoff = now - timedelta(hours=20)
    settled_cutoff = now - timedelta(days=7)
    rows = (session.query(Opportunity)
            .filter(Opportunity.reference.like("TED:%"))
            .filter(Opportunity.status.in_(["OPEN", "SIGNAL", "UNVERIFIED", "AWARDED", "CLOSED"]))
            .all())
    open_rows, settled_rows = [], []
    for opp in rows:
        checked = opp.last_checked.replace(tzinfo=None) if opp.last_checked else None
        if opp.status in ("OPEN", "SIGNAL", "UNVERIFIED") and (checked is None or checked < open_cutoff):
            open_rows.append(opp)
        elif opp.status in ("AWARDED", "CLOSED") and (checked is None or checked < settled_cutoff):
            settled_rows.append(opp)
    stamp = lambda opp: opp.last_checked.replace(tzinfo=None) if opp.last_checked else datetime.min
    open_rows.sort(key=stamp)
    settled_rows.sort(key=stamp)
    due = open_rows[:limit] + settled_rows[:max(5, limit // 4)]
    updated = 0
    for opp in due:
        procedure = (opp.reference or "")[4:]
        try:
            notices = _procedure_notices(procedure)
            latest = notices[-1] if notices else None
            found = _from_ted(latest["publication-number"], procedure) if latest else None
        except Exception as exc:
            session.rollback()
            errors.append(f"refresh {opp.opportunity_id}: {exc}"[:300])
            continue
        kind = (latest or {}).get("notice-type") or ""
        if found:
            found["awarded"] = bool(found.get("awarded") or kind.startswith(("can-", "veat")))
        if not found or not (found.get("awarded") or found.get("deadline")):
            opp.last_checked = now
            opp.verified_at = now
            session.commit()
            continue
        if _apply_notice(session, opp, found, now):
            updated += 1
        session.commit()
    return updated
