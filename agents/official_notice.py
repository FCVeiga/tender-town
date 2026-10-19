"""
When a tender was found on a news page rather than a procurement portal,
look up the call and attach the official notice: portal link, deadline,
value and the buyer's documents.

A match needs a reference code from the article (or a portal link on that
page). A title alone is not enough. The news URL is kept as another source.
"""
import os
import re
from datetime import datetime
from urllib.parse import quote, urljoin, urlparse

import requests
from sqlalchemy import text

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 TenderTown/1.0"}
SEDIA = "https://api.tech.ec.europa.eu/search-api/prod/rest/search"
TED_SEARCH = "https://api.ted.europa.eu/v3/notices/search"
_PORTALS = (
    "ted.europa.eu", "contractsfinder.service.gov.uk", "find-tender.service.gov.uk",
    "publiccontractsscotland.gov.uk", "boamp.fr", "tenderned.nl", "ecepp.ebrd.com",
)
_CODE = re.compile(r"\b[A-Z][A-Z0-9]{1,24}(?:[/-][A-Z0-9]{1,24}){2,8}\b")
_CFT = re.compile(r"tender-details/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-[A-Za-z0-9]+)?", re.I)
_TED_PUB = re.compile(r"/(\d{5,7}-\d{4})(?:[/?#]|$)")
_DOC_TYPES = {
    "tender specifications": "TENDER_SPECIFICATIONS",
    "financial offer form": "FINANCIAL_PROPOSAL",
    "invitation letter": "CONTRACT_NOTICE",
    "draft contract": "CONTRACT",
}


def _host(url: str) -> str:
    return urlparse(url or "").netloc.lower().removeprefix("www.")


def is_portal_url(url: str) -> bool:
    """A notice on a procurement portal, not a news page that mentions one."""
    if not url:
        return False
    if _CFT.search(url):
        return True
    host = _host(url)
    if host == "ted.europa.eu" or host.endswith(".ted.europa.eu"):
        return bool(_TED_PUB.search(url))
    return host in _PORTALS and urlparse(url).path not in ("", "/")


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


def _from_ted(publication: str):
    xml = _get(f"https://ted.europa.eu/en/notice/{publication}/xml")
    procedure = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", xml, re.I)
    portal = next((u for u in re.findall(r"<cbc:URI>([^<]+)</cbc:URI>", xml) if "tender-details/" in u), None)
    if portal:
        found = _from_portal(portal.split("#")[0])
        found["publication"] = found["publication"] or publication
        return found
    deadlines = re.findall(r"<cbc:EndDate>(\d{4}-\d{2}-\d{2})", xml)
    return {
        "portal_url": f"https://ted.europa.eu/en/notice/-/detail/{publication}",
        "procedure": procedure.group(1).lower() if procedure else None,
        "publication": publication,
        "title": None,
        "deadline": deadlines[-1] if deadlines else None,
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


def find_official(source_url: str, text: str = ""):
    """The portal record for a tender first seen at source_url, or None."""
    html = ""
    if source_url and not is_portal_url(source_url):
        try:
            html = _get(source_url)
        except Exception:
            html = ""
    for link in _links(html, source_url or ""):
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
            return _from_ted(ted["publication"])
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
    return None


def _remember(session, opportunity_id: str, url: str, title: str):
    if not url:
        return
    session.execute(text("""
        insert into item_sources (item_type, item_id, url, title, source_name, published_at)
        values ('tender', :i, :u, :title, :name, null)
        on conflict (item_type, item_id, url) do nothing
    """), {"i": opportunity_id, "u": url[:1024], "title": (title or "")[:500] or None,
           "name": (urlparse(url).netloc.removeprefix("www.")[:200] or None)})


def resolve_official(session, errors: list, only_id: str = None) -> int:
    """Attach the official portal to open tenders that were found somewhere else."""
    from database.models import ChangeEvent, ChangeImportance, Opportunity
    from agents.tender_documents import collect_documents
    query = session.query(Opportunity).filter(Opportunity.status.in_(["OPEN", "SIGNAL", "UNVERIFIED"]))
    if only_id:
        query = query.filter(Opportunity.opportunity_id == only_id)
    linked = 0
    for opp in query.all():
        if is_portal_url(opp.official_url or "") or (opp.reference or "").startswith("TED:"):
            continue
        try:
            found = find_official(opp.official_url or "", " ".join(
                part for part in (opp.title, opp.title_en, opp.summary) if part))
        except Exception as exc:
            session.rollback()
            errors.append(f"official {opp.opportunity_id}: {exc}"[:300])
            continue
        if not found or not found.get("portal_url") or found["portal_url"] == opp.official_url:
            continue
        now = datetime.utcnow()
        _remember(session, opp.opportunity_id, opp.official_url, opp.title)
        old_deadline = opp.deadline.replace(tzinfo=None) if opp.deadline else None
        new_deadline = datetime.strptime(found["deadline"], "%Y-%m-%d") if found.get("deadline") else None
        if new_deadline and old_deadline != new_deadline:
            verb = "extended" if old_deadline and new_deadline > old_deadline else "brought forward" if old_deadline else "set"
            old = old_deadline.strftime("%d %b %Y") if old_deadline else "none"
            session.add(ChangeEvent(
                opportunity_id=opp.opportunity_id, event_type="deadline", importance=ChangeImportance.MATERIAL,
                description=f"Deadline {verb}: {old} → {new_deadline.strftime('%d %b %Y')}",
                detected_at=now, notice_url=found["portal_url"],
                note_source="Read from the official notice"))
            opp.deadline = new_deadline
            opp.status = "OPEN" if new_deadline >= now else "CLOSED"
            opp.last_change = now
        opp.official_url = found["portal_url"][:1024]
        if found.get("procedure"):
            opp.reference = f"TED:{found['procedure']}"[:128]
        if found.get("title"):
            opp.title = found["title"]
            opp.title_en = found["title"]
        if found.get("value"):
            opp.estimated_value = found["value"]
            opp.currency = found.get("currency") or opp.currency
            opp.value_source = None
        opp.tender_summary = None
        opp.tender_analysed_at = None
        opp.last_checked = now
        opp.verified_at = now
        if new_deadline:
            opp.status_evidence = f"The contract notice deadline is {new_deadline.strftime('%d %B %Y').lstrip('0')}."
        session.commit()
        if found.get("procedure"):
            try:
                collect_documents(session, opp.opportunity_id, found["procedure"])
            except Exception as exc:
                session.rollback()
                errors.append(f"documents {opp.opportunity_id}: {exc}"[:300])
        linked += 1
    return linked
