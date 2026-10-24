"""
Tender documents — collects, for each tracked TED procurement, the list of
documents a bidder needs, with links that work from the site:

  - TED notice PDFs for every notice of the procedure (original + changes)
  - the buyer portal's own document list, where the portal shows it publicly:
      ePPS (Malta, Cyprus, Ireland, …): every file, with direct download links
      DTVP (Germany): every file by category, with direct download links
      ETHICS (Denmark and other Mercell ETHICS buyers): the public material API
      any other portal: files linked from the page TED names, when a download
      returns the file without a login
  - otherwise one link to the portal's documents page
  - when that page needs a user login, the summary says so and gives the URL

A document that appears after the first collection (a clarification note, an
updated form, a Q&A catalogue…) is logged as a change event, so it shows as
an update under the opportunity and as a feed post. No LLM involved.
"""
import hashlib
import html
import json
import re
import time
from datetime import datetime
from urllib.parse import unquote_plus, urljoin, urlparse

import requests
from sqlalchemy import text

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/126.0 Safari/537.36 TenderTown/1.0"}
TED_SEARCH = "https://api.ted.europa.eu/v3/notices/search"

# Document type from its name, across the languages notices come in.
_TYPES = [
    ("Q_AND_A", r"bieterfragen|questions? (and|&) answers|q ?& ?a|faq|fragenkatalog|ερωτήσ"),
    ("CLARIFICATION", r"clarification|klarstellung|klärung|chiarimento|aclaraci|éclaircissement|διευκρινίσ|pojasnil"),
    ("CORRIGENDUM", r"corrigend|berichtigung|rettifica|rectificat|διόρθωσ"),
    ("FINANCIAL_PROPOSAL", r"preisblatt|price|pricing|financial|financier|economic|οικονομικ|bid form"),
    ("AWARD_CRITERIA", r"bewertung|award criteria|evaluation|κριτήρια"),
    ("CONTRACT", r"vertrag|contract|contrat|contratto|σύμβαση|auftragsverarbeitung"),
    ("TECHNICAL_SPECIFICATIONS", r"leistungsbeschreibung|specification|technical|technisch|τεχνικ|terms of reference|lastenheft"),
    ("FORM", r"formblatt|form\b|formular|eigenerkl|declaration|espd|δήλωση|έντυπο"),
    ("TENDER_SPECIFICATIONS", r"angebotsbedingungen|instructions|tender document|dossier|disciplinare|διακήρυξη|invitation|forms and annexes"),
    ("FORM", r"espd"),
]


# The agent's settings (editable on Settings → Tender Documents Agent; JSON):
#   type_patterns — how a file is sorted, by its name: [type, regex], first match wins
#   alert_on_new  — types that, published after the first collection, post an update
#   skip_extensions — files never listed (machine-readable copies)
#   only_active   — collect for open tenders only
DEFAULT_CONFIG = {
    "type_patterns": [list(t) for t in _TYPES],
    "alert_on_new": ["CLARIFICATION", "Q_AND_A", "CORRIGENDUM", "FINANCIAL_PROPOSAL", "TECHNICAL_SPECIFICATIONS"],
    "skip_extensions": [".xml"],
    "only_active": True,
}


def config() -> dict:
    """DEFAULT_CONFIG with the Settings page's edits on top (ignored if unreadable)."""
    from services.agent_settings import agent_config
    out = dict(DEFAULT_CONFIG)
    try:
        out.update({k: v for k, v in json.loads(agent_config("tender_documents") or "{}").items() if k in DEFAULT_CONFIG})
    except (ValueError, AttributeError):
        pass
    return out


def classify(name: str) -> str:
    low = (name or "").lower()
    for doc_type, pattern in config()["type_patterns"]:
        try:
            if re.search(pattern, low):
                return doc_type
        except re.error:
            continue
    return "ANNEX"


_PROJECT = re.compile(r"<cac:ProcurementProject\b.*?</cac:ProcurementProject>", re.S)
_PROJECT_DESC = re.compile(r"<cbc:Description\b[^>]*>([^<]{40,800})</cbc:Description>")


def notice_brief(publication_number: str) -> str:
    """The contract's own description from the TED notice, for a summary. Empty when TED has none."""
    num = (publication_number or "").strip()
    if not num:
        return ""
    try:
        r = _get(f"https://ted.europa.eu/en/notice/{num}/xml")
    except Exception:
        return ""
    if r.status_code != 200:
        return ""
    texts = []
    for block in _PROJECT.findall(r.text or "")[:6]:
        for desc in _PROJECT_DESC.findall(block):
            text = html.unescape(re.sub(r"\s+", " ", desc)).strip()
            if text and text not in texts:
                texts.append(text)
    return "\n".join(texts)[:1600]


def _get(url, **kw):
    for attempt in range(3):
        r = requests.get(url, headers=UA, timeout=40, **kw)
        if r.status_code != 429:
            return r
        time.sleep(2 ** (attempt + 1))
    return r


def _procedure_notices(procedure_id: str) -> list:
    for attempt in range(5):
        time.sleep(1.2)
        r = requests.post(TED_SEARCH, json={"query": f"procedure-identifier={procedure_id}",
                                            "fields": ["publication-number", "publication-date", "notice-type"],
                                            "limit": 50}, timeout=30)
        if r.status_code != 429:
            break
        time.sleep(2 ** (attempt + 1))
    r.raise_for_status()
    return sorted(r.json().get("notices", []), key=lambda n: n["publication-date"])


def _notice_xml(publication_number: str) -> str:
    """The notice XML. A rate-limit page is not an empty notice."""
    response = _get(f"https://ted.europa.eu/en/notice/{publication_number}/xml")
    body = response.text or ""
    if response.status_code != 200 or "<cbc:" not in body[:8000]:
        raise RuntimeError(f"TED notice {publication_number} XML was not readable (HTTP {response.status_code})")
    return body


def _notice_document_urls(publication_number: str) -> list:
    xml = _notice_xml(publication_number)
    blocks = re.findall(r"<cac:CallForTendersDocumentReference>(.*?)</cac:CallForTendersDocumentReference>", xml, re.S)
    return list(dict.fromkeys(
        html.unescape(u.strip()) for b in blocks for u in re.findall(r"<cbc:URI>([^<]+)</cbc:URI>", b)
    ))


def _epps_documents(url: str) -> list:
    """ePPS 'listContractDocuments' page(s): (title, file name, direct URL)."""
    resource = re.search(r"resourceId=(\d+)", url)
    if not resource:
        return []
    base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    first = _get(url).text
    table = re.search(r"d-(\d+)-p=", first)
    pages = [first]
    if table:
        for p in range(2, 30):
            page = _get(f"{base}/epps/cft/listContractDocuments.do?resourceId={resource.group(1)}&d-{table.group(1)}-p={p}").text
            if page in pages or not re.search(r"downloadDocForAnonymous\('\d+'\)", page):
                break
            pages.append(page)
    docs = {}
    for page in pages:
        for row in re.split(r"<tr[ >]", page):
            link = re.search(r"downloadDocForAnonymous\('(\d+)'\)\">([^<]+)</a>", row)
            if not link:
                continue
            cells = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", c)).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
            if link.group(2).strip().lower().endswith(tuple(config()["skip_extensions"])):
                continue  # machine-readable copies (ESPD request, c4t) of files listed as PDF
            title = next((c for c in cells if c and not c.isdigit() and c != link.group(2).strip() and c.upper() != "N/A"), "")
            docs[link.group(1)] = (html.unescape(title), html.unescape(link.group(2)).strip(),
                                   f"{base}/epps/cft/downloadContractDocument.do?documentId={link.group(1)}&resourceId={resource.group(1)}")
    return list(docs.values())


def _epps_pack(url: str):
    """The anonymous zip of every file on an ePPS notice, when the portal serves one."""
    resource = re.search(r"resourceId=(\d+)", url or "")
    if not resource or "/epps/" not in (url or ""):
        return None
    parsed = urlparse(url)
    pack = (f"{parsed.scheme}://{parsed.netloc}/epps/cft/downloadCftResourceItems.do"
            f"?resourceId={resource.group(1)}&resourceType=ContractDocument")
    try:
        response = requests.get(pack, headers=UA, timeout=40, stream=True)
        head = response.raw.read(8) or b""
        response.close()
    except Exception:
        return None
    if _file_kind(head) != "zip":
        return None
    return (f"Procurement documents.zip", "TENDER_SPECIFICATIONS", pack)


_DTVP_GROUPS = {"address": "TENDER_SPECIFICATIONS", "serviceDescription": "TECHNICAL_SPECIFICATIONS",
                "filledByCompany": "FORM", "contractCondition": "CONTRACT"}


_COSINE_ID = re.compile(r"/(?:notice|project)/([A-Z][A-Z0-9]{5,})")


def _cosine_pages(url: str) -> list:
    """Public project pages for a cosinex satellite (DTVP, NRW, GIZ, and the same software elsewhere)."""
    parsed = urlparse(url or "")
    match = _COSINE_ID.search(parsed.path or "")
    if not match or not parsed.netloc:
        return [url] if url else []
    prefix = "/VMPSatellite" if "/VMPSatellite/" in parsed.path else ("/Satellite" if "/Satellite/" in parsed.path else "")
    root = f"{parsed.scheme}://{parsed.netloc}{prefix}/public/company/project/{match.group(1)}/de"
    return [f"{root}/documents", f"{root}/overview"]


def _dtvp_documents(url: str) -> list:
    """Cosinex project room: (file name, type hint, direct URL).

    The documents tab is the dossier. When that room has been taken down, the
    overview still links the notice PDF.
    """
    out = []
    for page in _cosine_pages(url):
        try:
            response = _get(page)
        except Exception:
            continue
        if response.status_code != 200:
            continue
        body = response.text or ""
        found = []
        for group, path in re.findall(r'href="\./documents/(\w+)/([^";]+)', body):
            if group == "archive":
                continue
            name = unquote_plus(unquote_plus(path))
            name = re.sub(r"\s*\(ID \d+\)", "", name)
            found.append((name, _DTVP_GROUPS.get(group), urljoin(response.url, html.unescape(f"./documents/{group}/{path}"))))
        for number, path in re.findall(r'href="\./announcements/(\d+)/([^";]+)', body):
            name = unquote_plus(unquote_plus(path.rsplit("/", 1)[-1]))
            found.append((name, classify(name), urljoin(response.url, html.unescape(f"./announcements/{number}/{path}"))))
        if found:
            out.extend(found)
            if "/documents" in (response.url or page):
                break
    return list({item[2]: item for item in out}.values())


_OCID = re.compile(r"(ocds-\d+-[0-9a-f-]{16,})", re.I)


def _seap_documents(url: str) -> list:
    """Romania's SEAP publishes the dossier as one public zip once the archive is generated."""
    if "e-licitatie.ro" not in (url or ""):
        return []
    match = re.search(r"/view/(\d+)", url or "")
    if not match:
        return []
    notice_id = match.group(1)
    notice_type = "2"
    headers = {**UA, "Referer": url, "Accept": "application/json"}
    try:
        status = requests.get(
            "https://www.e-licitatie.ro/api-pub/NoticeCommon/GetArchiveStatus/",
            params={"initNoticeId": notice_id, "sysNoticeTypeId": notice_type},
            headers=headers, timeout=30,
        )
        item = (status.json() or {}).get("archiveItem") or {} if status.status_code == 200 else {}
    except Exception:
        return []
    if item.get("sysArchiveStatusId") != 3:
        return []
    name = f"{item.get('noticeNo')}.zip" if item.get("noticeNo") else "Procurement documents.zip"
    download = ("https://www.e-licitatie.ro/api-pub/NoticeCommon/DownloadArchive/"
                f"?initNoticeId={notice_id}&sysNoticeTypeId={notice_type}")
    return [(name[:180], "TENDER_SPECIFICATIONS", download)]


def _eop_signed_url(document_id: int) -> str:
    response = requests.post(
        "https://service.eop.bg/NX1Service.svc/GetSignedUrlByDocumentId",
        json={"documentId": document_id},
        headers={**UA, "Content-Type": "application/json", "Origin": "https://app.eop.bg"},
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    base = str(data.get("BaseUri") or "").rstrip("/")
    token = data.get("Token") or ""
    url = f"{base}/{data.get('Container')}/{data.get('CloudName')}"
    return f"{url}?{token}" if token else url


def _eop_documents(url: str) -> list:
    """Bulgaria's EOP serves the dossier as a zip export of the public tender."""
    if "eop.bg" not in (url or ""):
        return []
    match = re.search(r"/today/(\d+)", url)
    if not match:
        return []
    tender_id = match.group(1)
    page = f"https://app.eop.bg/today/{tender_id}"
    name = "Procurement documents"
    try:
        response = requests.post(
            "https://service.eop.bg/NX1Service.svc/GetPublishedTenderExportsByTenderId",
            json={"tenderId": int(tender_id), "ianaTimeZone": "Europe/Sofia"},
            headers={**UA, "Content-Type": "application/json", "Origin": "https://app.eop.bg"},
            timeout=30,
        )
        exports = response.json() if response.status_code == 200 else []
        chosen = next((item for item in exports if item.get("IsFullExport")), None) if isinstance(exports, list) else None
        chosen = chosen or (exports[0] if isinstance(exports, list) and exports else None)
        if chosen and chosen.get("Name"):
            name = str(chosen["Name"])[:180]
        if chosen and chosen.get("DocumentId"):
            signed = _eop_signed_url(int(chosen["DocumentId"]))
            probe = requests.get(signed, headers=UA, timeout=40, stream=True)
            head = probe.raw.read(4) or b""
            probe.close()
            if probe.status_code == 200 and head[:2] == b"PK":
                return [(name, "TENDER_SPECIFICATIONS", page)]
    except Exception:
        return []
    return []


def _tenderned_documents(url: str) -> list:
    """TenderNed publicaties/{id}/documenten lists the dossier and a stable download URL."""
    if "tenderned.nl" not in (url or ""):
        return []
    match = re.search(r"/(\d{5,})(?:[/?#]|$)", urlparse(url).path or "")
    if not match:
        return []
    try:
        response = _get(f"https://www.tenderned.nl/papi/tenderned-rs-tns/v2/publicaties/{match.group(1)}/documenten")
        payload = response.json() if response.status_code == 200 else {}
    except Exception:
        return []
    docs = []
    for doc in payload.get("documenten") or []:
        if doc.get("virusIndicatie"):
            continue
        href = ((doc.get("links") or {}).get("download") or {}).get("href") or ""
        if not href.startswith("/"):
            continue
        code = ((doc.get("typeDocument") or {}).get("code") or "").lower()
        name = (doc.get("documentNaam") or "document").strip()
        if code in ("pdf", "doc", "docx", "xls", "xlsx", "zip", "odt") and not re.search(r"\.(pdf|docx?|xlsx?|zip|odt)$", name, re.I):
            name = f"{name}.{code}"
        if name.lower().endswith(tuple(config()["skip_extensions"])):
            continue
        docs.append((name[:180], _portal_type(name), "https://www.tenderned.nl" + href))
        if len(docs) >= 40:
            break
    return docs


def _ezamowienia_documents(url: str) -> list:
    """Poland's e-Zamówienia publishes the dossier as a public JSON list."""
    if "ezamowienia.gov.pl" not in (url or ""):
        return []
    match = _OCID.search(url)
    if not match:
        return []
    ocid = match.group(1)
    try:
        response = _get("https://ezamowienia.gov.pl/mp-readmodels/api/Search/GetTenderDocuments",
                        params={"tenderId": ocid})
        payload = response.json() if response.status_code == 200 else []
    except Exception:
        return []
    if not isinstance(payload, list):
        return []
    docs = []
    for doc in payload:
        if (doc.get("tenderDocumentState") or "") != "Published" or doc.get("deleteDate"):
            continue
        object_id = doc.get("objectId") or ""
        name = (doc.get("fileName") or doc.get("name") or "").strip()
        if not object_id or not name:
            continue
        if name.lower().endswith(tuple(config()["skip_extensions"])):
            continue
        download = f"https://ezamowienia.gov.pl/mp-readmodels/api/Tender/DownloadDocument/{ocid}/{object_id}"
        suffix = object_id.rsplit("_", 1)[-1]
        order = int(suffix) if suffix.isdigit() else 999
        docs.append((order, name[:180], _portal_type(name), download))
    docs.sort(key=lambda item: item[0])
    return [(name, kind, download) for _order, name, kind, download in docs[:40]]


_ETHICS_ID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
_GATED = "The documents are in a gated portal that needs user login:"


def _ethics_tender_id(url: str):
    parsed = urlparse(url or "")
    host = parsed.netloc.lower()
    if "ethics." not in host and "/ethics/" not in (parsed.path or ""):
        return None
    match = _ETHICS_ID.search(parsed.fragment or parsed.path or "")
    return match.group(0) if match else None


def _ethics_documents(url: str):
    """(files, gated). Files are public downloads. gated is true only when the
    portal itself refused them. A failed request is neither: the next run retries."""
    tender_id = _ethics_tender_id(url)
    if not tender_id:
        return [], False
    parsed = urlparse(url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    response = _get(f"{base}/ethics/publicTenderDocs/{tender_id}")
    if response.status_code in (401, 403):
        return [], True
    if response.status_code != 200:
        return [], False
    try:
        payload = response.json()
    except ValueError:
        return [], False
    docs = []
    restricted = False
    skip = tuple(config()["skip_extensions"])
    for doc in payload.get("tenderDocs") or []:
        if (doc.get("type") or "").upper() not in ("DOWNLOAD", "RESPONSE"):
            continue
        if doc.get("accessRequired"):
            restricted = True
            continue
        filename = (doc.get("filename") or "").strip()
        if not filename or filename.lower().endswith(skip):
            continue
        doc_id = doc.get("_id") or ""
        if not doc_id:
            continue
        label = (doc.get("cat") or "").strip()
        name = f"{label} — {filename}" if label and label.lower() not in filename.lower() else filename
        published = ((doc.get("uploadDate") or {}).get("$date") or "")[:10] or None
        download = f"{base}/ethics/publicTenderDoc/{tender_id}/{doc_id}/download"
        docs.append((name, classify(f"{label} {filename}"), download, published))
    if docs:
        return docs, False
    return [], restricted


_FILE_EXT = re.compile(r"(?:\.(?:pdf|docx?|xlsx?|odt|rtf|zip|7z)|-(?:pdf|docx?|xlsx?))(?:$|[?#&])", re.I)
_EZAK_FILE = re.compile(r"(?:^|/)document_\d+/", re.I)
_DOC_LABEL = re.compile(
    r"règlement|reglement|dossier de consultation|cahier des charges|pliego|vergabeunterlagen|"
    r"tender document|bidding document|terms of reference|specification|leistungsbeschreibung|"
    r"\bdce\b|\brc\b|pièce de la consultation|piece de la consultation",
    re.I,
)
_SIZE = re.compile(r"\d+(?:[.,]\d+)?\s*(?:ko|mo|go|kb|mb|gb)\b", re.I)
_SKIP_HREF = re.compile(r"login|sign-?in|connexion|reset-password|inscription|panier|javascript:|mailto:", re.I)
_DOWNLOADISH = re.compile(
    r"download|t[eé]l[eé]charg|document|pliego|anexo|specification|reglement|règlement|\bdce\b|getfile|fichier|vergabeunterlage",
    re.I,
)
_MAX_PORTAL_LINKS = 24
_MAX_PORTAL_FILES = 16
_DIRECT = re.compile(
    r"GetDocument|downloadContractDocument|downloadCftResourceItems|documentId=|"
    r"DownloadReglement|DemandeTelechargementDce|/file/get_new/",
    re.I,
)
_MAX_FILE_BYTES = 30_000_000


def _file_kind(data: bytes) -> str:
    if data[:4] == b"%PDF":
        return "pdf"
    if data[:2] == b"PK":
        return "zip"
    if data[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        return "ole"
    return ""


def _same_site(left: str, right: str) -> bool:
    a = urlparse(left).netloc.lower().removeprefix("www.")
    b = urlparse(right).netloc.lower().removeprefix("www.")
    return bool(a) and a == b


def _specific_page(page_url: str) -> bool:
    """A tender page, rather than the portal's front door."""
    parsed = urlparse(page_url or "")
    path = (parsed.path or "/").rstrip("/")
    if path.lower() in ("", "/", "/entreprise"):
        return False
    return bool(re.search(r"\d|[0-9a-f]{8}-", f"{path}?{parsed.query or ''}", re.I))


def portal_candidates(page_url: str, body: str) -> list:
    """(label, absolute url) for files a buyer page links, not the site's own menu."""
    found = []
    seen = set()
    specific = _specific_page(page_url)
    for href, inner in re.findall(r"""<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)</a>""", body or "", re.S | re.I):
        label = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(inner))).strip()
        raw = html.unescape(href).strip()
        if not raw or raw.startswith("#") or _SKIP_HREF.search(raw):
            continue
        absolute = urljoin(page_url, raw)
        if not _same_site(page_url, absolute) or absolute in seen:
            continue
        label_ok = bool(_DOC_LABEL.search(label) or _DOC_LABEL.search(absolute))
        downloadish = bool(_DOWNLOADISH.search(absolute))
        file_link = bool(_FILE_EXT.search(absolute.split("#")[0]))
        direct = bool(_DIRECT.search(absolute))
        ezak_file = bool(_EZAK_FILE.search(urlparse(absolute).path or ""))
        if direct or ezak_file or (file_link and (specific or label_ok or downloadish)):
            keep = True
        elif label_ok and (downloadish or bool(_SIZE.search(label))):
            keep = True
        else:
            keep = False
        if not keep:
            continue
        seen.add(absolute)
        found.append((label[:180], absolute))
        if len(found) >= _MAX_PORTAL_LINKS:
            break
    return found


def _login_wall(url: str, status: int, final_url: str, body: str) -> bool:
    """A page that asks for a login before it shows any documents."""
    if status == 401:
        return True
    if status == 403:
        low = (body or "")[:8000].lower()
        return any(word in low for word in ("password", "log in", "login", "sign in", "anmelden", "connexion"))
    if status != 200:
        return False
    final = (final_url or "").lower()
    if any(part in final for part in ("/login", "/signin", "/sign-in", "/logon")):
        return True
    sample = (body or "")[:30000]
    low = sample.lower()
    if 'type="password"' not in low and "type='password'" not in low:
        return False
    if re.search(r'href="[^"]+\.(pdf|docx|xlsx|zip)"', low) or portal_candidates(url, sample):
        return False
    title = re.search(r"<title[^>]*>(.*?)</title>", sample, re.S)
    headings = " ".join(re.findall(r"<h1[^>]*>(.*?)</h1>", sample, re.S)[:2])
    label = re.sub(r"<[^>]+>", " ", f"{title.group(1) if title else ''} {headings}")
    return bool(re.search(r"\b(log ?in|sign ?in|log ind|anmelden|connexion)\b", label, re.I))


def _requires_login(url: str) -> bool:
    """The portal answered with a login wall. A login box in the header of a
    page that already lists the files is not one."""
    try:
        response = _get(url)
    except Exception:
        return False
    return _login_wall(url, response.status_code, response.url, response.text or "")


def _portal_type(name: str) -> str:
    """A consultation file is a tender specification. An unnamed PDF or zip is too."""
    if _DOC_LABEL.search(name or ""):
        return "TENDER_SPECIFICATIONS"
    kind = classify(name)
    if kind == "ANNEX" and re.search(r"\.(pdf|zip|docx?|xlsx?|odt)$", name or "", re.I):
        return "TENDER_SPECIFICATIONS"
    return kind


def harvest_portal(url: str, known: set = None) -> dict:
    """Files a portal page gives out without a login.

    files is (name, url) for each response that is itself a pdf, office file or zip.
    gated is true only when the page blocks the documents behind a login and no file
    could be read. A page that merely links onwards stays ungated, with whatever
    files it did give up.
    """
    url = html.unescape(url or "").strip()
    known = known or set()
    out = {"files": [], "gated": False, "listed": 0}
    if not url.startswith("http"):
        return out
    session = requests.Session()
    session.headers.update(UA)
    try:
        response = session.get(url, timeout=25)
    except Exception:
        return out
    data = response.content or b""
    if response.status_code == 200 and _file_kind(data) and 200 <= len(data) <= _MAX_FILE_BYTES:
        name = urlparse(response.url).path.rsplit("/", 1)[-1] or "document"
        out["files"].append((name[:180], url))
        out["listed"] = 1
        return out
    body = response.text or ""
    if _login_wall(url, response.status_code, response.url, body):
        out["gated"] = True
        return out
    page = response.url or url
    candidates = portal_candidates(page, body)
    out["listed"] = len(candidates)
    seen = set()
    for label, link in candidates:
        if link in seen:
            continue
        seen.add(link)
        if link in known:
            out["files"].append((label[:180], link))
            continue
        if len(out["files"]) >= _MAX_PORTAL_FILES:
            break
        try:
            got = session.get(link, timeout=25)
        except Exception:
            continue
        blob = got.content or b""
        if got.status_code != 200 or not _file_kind(blob) or not (200 <= len(blob) <= _MAX_FILE_BYTES):
            continue
        disposition = got.headers.get("content-disposition") or ""
        named = re.search(r"filename\*?=(?:UTF-8''|\"?)([^\";]+)", disposition, re.I)
        name = label or (unquote_plus(named.group(1)).strip() if named else "") or link.rsplit("/", 1)[-1]
        out["files"].append((name[:180], link))
    return out


def note_gated_portal(session, opportunity_id: str, url: str):
    """The summary the page shows, when the dossier cannot be read without a login."""
    sentence = f"{_GATED} {url}"
    row = session.execute(text("select summary, tender_summary from opportunities where opportunity_id = :o"),
                          {"o": opportunity_id}).first()
    if not row:
        return
    for column in ("summary", "tender_summary"):
        current = (getattr(row, column) or "").strip()
        if column == "tender_summary" and not current:
            continue
        if sentence in current:
            continue
        updated = f"{current}\n\n{sentence}".strip() if current else sentence
        session.execute(text(f"update opportunities set {column} = :s where opportunity_id = :o"),
                        {"s": updated, "o": opportunity_id})


def notice_label(kind: str, index: int) -> str:
    """What a notice is in the procedure's timeline. The first contract notice is
    the publication itself; a later cn- is a change (deadline, corrigendum)."""
    kind = kind or ""
    if kind.startswith(("can-", "veat")):
        return "Contract award notice"
    if kind.startswith("pin-"):
        return "Prior information notice"
    if kind == "pmc":
        return "Market consultation notice"
    if index > 0 and kind.startswith("cn-"):
        return "Change notice"
    return "Contract notice"


def _walk_netserver(node, found: list) -> None:
    if not isinstance(node, dict):
        return
    if node.get("fileName") and node.get("encodedName"):
        found.append(node)
        return
    for value in node.values():
        _walk_netserver(value, found)


def _xvergabe_pack(url: str) -> list:
    """xvergabe lists the dossier on the procedure page and signs a zip for a few minutes."""
    match = re.search(r"/awardProcedure/([0-9a-f-]{36})", url or "")
    if not match:
        return []
    procedure = match.group(1)
    page = f"https://xvergabe.de/awardProcedure/{procedure}"
    try:
        browser = requests.Session()
        browser.get(page, headers=UA, timeout=30)
        fragment = browser.get(f"https://xvergabe.de/award-procedure-fragment?procedureId={procedure}",
                                headers=UA, timeout=30)
        html_body = fragment.text or ""
        forms = re.findall(
            r'<form[^>]*action="((?:legacy-document|document)/[0-9a-f-]{36}/download-uri)"[^>]*>(.*?)</form>',
            html_body, re.S)
        if fragment.status_code != 200 or not forms:
            return []
        names = []
        for action, body in forms:
            token = re.search(r'name="_csrf" value="([^"]+)"', body)
            documents = re.findall(r'name="documentIds" value="([^"]+)"', body)
            if not token or not documents:
                continue
            posted = browser.post(
                "https://xvergabe.de/awardProcedure/" + action,
                data=[("_csrf", token.group(1)), ("procedureId", procedure)] + [("documentIds", item) for item in documents],
                headers={**UA, "X-CSRF-TOKEN": token.group(1)}, timeout=40)
            path = ((posted.text or "").strip().splitlines() or [""])[0].strip()
            if posted.status_code != 200 or not (path.startswith("/NetServer/") or path.startswith("/files/download-collection")):
                continue
            probe = browser.get("https://xvergabe.de" + path, headers=UA, timeout=60, stream=True)
            head = probe.raw.read(2) or b""
            disposition = probe.headers.get("content-disposition") or ""
            probe.close()
            if head != b"PK":
                continue
            named = re.search(r'filename="([^"]+)"', disposition)
            names.append(named.group(1) if named else "Procurement documents.zip")
    except Exception:
        return []
    if not names:
        return []
    # One procedure page can sign several packages. The stored link stays the page; reading it fetches every package.
    name = names[0] if len(names) == 1 else "Procurement documents.zip"
    return [(name[:180], "TENDER_SPECIFICATIONS", page)]


def _ankoe_documents(url: str) -> list:
    """ANKÖ publishes the dossier as a zip. The stored link is the notice page."""
    match = re.search(r"/Detail/(\d+)", url or "")
    if not match or "vergabeportal.at" not in (url or ""):
        return []
    try:
        listed = requests.get(f"https://bbg.vergabeportal.at/api/Procurement/Notice/Get/{match.group(1)}",
                              headers={**UA, "Accept": "application/json"}, timeout=30)
        result = listed.json().get("result") or {} if listed.status_code == 200 else {}
        files = [item for item in (result.get("files") or []) if item.get("active") and item.get("name")]
        pack = next((item for item in files if str(item.get("name")).lower().startswith("gesamtpaket")
                     and str(item.get("extension") or "").lower() == ".zip"), None)
        pack = pack or next((item for item in files if str(item.get("extension") or "").lower() == ".zip"), None)
        if not pack:
            return []
        body = {key: value for key, value in pack.items() if key != "content"}
        posted = requests.post("https://bbg.vergabeportal.at/api/Procurement/Notice/GetFile/",
                               data={"noticeFile": json.dumps(body), "captcha": ""},
                               headers=UA, timeout=90, stream=True)
        head = posted.raw.read(2) or b""
        posted.close()
    except Exception:
        return []
    if head != b"PK":
        return []
    return [(str(pack["name"])[:180], "TENDER_SPECIFICATIONS", url)]


def _riigihanked_pack(url: str) -> list:
    """Estonia's register signs the public dossier zip for a few minutes. The stored link is the procedure page."""
    if "riigihanked.riik.ee" not in (url or ""):
        return []
    match = re.search(r"/procurement/(\d+)", url)
    if not match:
        return []
    try:
        meta = requests.get(
            f"https://riigihanked.riik.ee/rhr/api/public/v1/procurement/{match.group(1)}/documents-temp-url",
            headers={**UA, "Accept": "application/json"}, timeout=30)
        path = str((meta.json() or {}).get("value") or "") if meta.status_code == 200 else ""
        if not path.startswith("/filetransfer/"):
            return []
        probe = requests.get("https://riigihanked.riik.ee" + path, headers=UA, timeout=60, stream=True)
        head = probe.raw.read(2) or b""
        probe.close()
    except Exception:
        return []
    if head != b"PK":
        return []
    return [("Procurement documents.zip", "TENDER_SPECIFICATIONS", url)]


def _netserver_documents(url: str) -> list:
    """Administration Intelligence NetServer publishes each file at a stable download address."""
    if "TenderingProcedureDetails" not in (url or "") and "TenderOID=" not in (url or "") and "/awardProcedure/" not in (url or ""):
        return []
    if "/awardProcedure/" in (url or ""):
        return _xvergabe_pack(url)
    browser = requests.Session()
    try:
        response = browser.get(url, headers=UA, timeout=30, allow_redirects=True)
    except Exception:
        return []
    final = response.url or url
    if "/awardProcedure/" in final:
        return _xvergabe_pack(final)
    body = response.text or ""
    oid = re.search(r'data-oid="([^"]+)" data-token="([^"]+)"', body)
    if not oid or "zipFileContents" not in body:
        return []
    try:
        tree = browser.post(f"{urlparse(final).scheme}://{urlparse(final).netloc}/NetServer/DataProvider",
                            data={"param": "FileTree", "oid": oid.group(1), "VALIDATION_TOKEN": oid.group(2)},
                            headers={**UA, "Referer": final}, timeout=30)
        listing = tree.json()
    except Exception:
        return []
    rows = []
    _walk_netserver(listing, rows)
    skip = tuple(config()["skip_extensions"])
    origin = f"{urlparse(final).scheme}://{urlparse(final).netloc}"
    files = []
    seen = set()
    for row in rows:
        name = str(row.get("fileName") or "").strip()
        encoded = str(row.get("encodedName") or "").strip()
        if not name or not encoded or name.lower().endswith(skip) or encoded in seen:
            continue
        seen.add(encoded)
        link = (f"{origin}/NetServer/TenderingProcedureDetails?function=_DownloadTenderDocument"
                f"&documentOID={oid.group(1)}&Document={encoded}")
        files.append((name[:180], _portal_type(name), link))
        if len(files) >= 40:
            break
    return files


def resolve_portal(url: str, known: set = None) -> dict:
    """Files behind one buyer URL. gated is set only when a login wall is all the page offers."""
    known = known or set()
    host = urlparse(url).netloc
    found = []
    gated = False
    partial = False
    if "/epps/" in url and ("listContractDocuments" in url or "listDPSContractDocuments" in url):
        found = [(f"{title} — {fname}" if title and title.lower() not in fname.lower() else fname,
                  classify(f"{title} {fname}"), dl, None, None) for title, fname, dl in _epps_documents(url)]
        pack = _epps_pack(url)
        if pack and pack[2] not in known:
            found.insert(0, (*pack, None, None))
    elif "e-licitatie.ro" in host:
        found = [(name, hint, dl, None, None) for name, hint, dl in _seap_documents(url)]
    elif "eop.bg" in host:
        found = [(name, hint, dl, None, None) for name, hint, dl in _eop_documents(url)]
    elif "tenderned.nl" in host:
        found = [(name, hint, dl, None, None) for name, hint, dl in _tenderned_documents(url)]
    elif "ezamowienia.gov.pl" in host:
        found = [(name, hint, dl, None, None) for name, hint, dl in _ezamowienia_documents(url)]
    elif "dtvp.de" in host or _COSINE_ID.search(urlparse(url).path or ""):
        found = [(name, hint or classify(name), dl, None, None) for name, hint, dl in _dtvp_documents(url)]
    elif "tender-details/" in url:
        from agents.official_notice import funding_documents
        found = [(name, hint or classify(name), dl, published, None)
                 for name, hint, dl, published in funding_documents(url.split("#")[0])]
    elif _ethics_tender_id(url):
        files, gated = _ethics_documents(url)
        found = [(name, hint, dl, published, None) for name, hint, dl, published in files]
    elif "TenderingProcedureDetails" in url or "TenderOID=" in url or "/awardProcedure/" in url:
        found = [(name, hint, dl, None, None) for name, hint, dl in _netserver_documents(url)]
    elif "riigihanked.riik.ee" in host:
        found = [(name, hint, dl, None, None) for name, hint, dl in _riigihanked_pack(url)]
    elif "vergabeportal.at" in host and "/Detail/" in url:
        found = [(name, hint, dl, None, None) for name, hint, dl in _ankoe_documents(url)]
    else:
        harvested = harvest_portal(url, known)
        if harvested["files"]:
            found = [(name, _portal_type(name), link, None, None) for name, link in harvested["files"]]
            partial = harvested["listed"] > len(harvested["files"])
        elif harvested["gated"]:
            gated = True
    return {"files": found, "gated": gated, "partial": partial}


def _portal_urls_on_record(session, opportunity_id: str) -> list:
    """Portal links already stored for this tender, when a fresh TED read fails."""
    official = session.execute(text("select official_url from opportunities where opportunity_id = :o"),
                               {"o": opportunity_id}).scalar() or ""
    stored = session.execute(text("select url from documents where opportunity_id = :o"),
                             {"o": opportunity_id}).fetchall()
    urls = []
    if str(official).startswith("http") and "ted.europa.eu" not in official:
        urls.append(html.unescape(official.strip()))
    for row in stored:
        url = html.unescape((row.url or "").strip())
        if url.startswith("http") and "ted.europa.eu" not in url:
            urls.append(url)
    return list(dict.fromkeys(urls))


# An analysis that says the notice or the dossier was missing. The page shows the notice summary.
_UNREAD_SQL = """(
    tender_summary ilike '%almost no information%'
    or tender_summary ilike '%does not include the content%'
    or tender_summary ilike '%not supplied%'
    or tender_summary ilike '%not among the files%'
    or tender_summary ilike '%no substantive%'
    or tender_summary ilike '%does not say what is being procured%'
    or tender_summary ilike '%are all empty%'
    or tender_summary ilike '%material supplied for this%'
    or tender_summary ilike '%material provided for this%'
    or tender_summary ilike '%material available for this%'
    or tender_summary ilike '%source material%'
)"""

_ACTIVE_PUBLISHED = """
    status in ('OPEN', 'SIGNAL')
    and (deadline is null or deadline >= now())
    and exists (
        select 1 from scope_items si
        where si.item_id = opportunities.opportunity_id and si.item_type = 'tender')
    and (status <> 'SIGNAL' or deadline is not null or publication_date is null
         or publication_date >= now() - interval '183 days')
"""


def retire_stale_analysis(session, opportunity_id: str) -> None:
    """Drop an analysis the current documents have overtaken, or one that says they were missing."""
    session.execute(text(f"""
        update opportunities set tender_summary = null, tender_analysed_at = null
        where opportunity_id = :o
          and tender_summary is not null
          and (
            {_UNREAD_SQL}
            or (
              tender_analysed_at is not null
              and tender_analysed_at < (
                select max(d.downloaded_at) from documents d
                where d.opportunity_id = :o
                  and coalesce(d.url, '') not like '%ted.europa.eu%'
                  and d.name not like 'Tender documents on %'
                  and d.name not like 'Procurement documents (login required)%'
              )
            )
          )
    """), {"o": opportunity_id})


def clear_stale_analyses(session) -> int:
    """Active tenders on a scope return to the notice summary when the analysis never read the dossier."""
    before = session.execute(text(
        f"select count(*) from opportunities where {_ACTIVE_PUBLISHED} and {_UNREAD_SQL}")).scalar()
    result = session.execute(text(f"""
        update opportunities set tender_summary = null, tender_analysed_at = null
        where {_ACTIVE_PUBLISHED} and {_UNREAD_SQL}
    """))
    session.commit()
    left = session.execute(text(
        f"select count(*) from opportunities where {_ACTIVE_PUBLISHED} and {_UNREAD_SQL}")).scalar()
    if left != 0 or result.rowcount != before:
        raise RuntimeError(f"stale summaries: expected to clear {before}, cleared {result.rowcount}, still matching {left}")
    return result.rowcount


def collect_documents(session, opportunity_id: str, procedure_id: str) -> dict:
    """Refresh one opportunity's document list. Returns {'documents': n, 'new': [names]}."""
    notices = _procedure_notices(procedure_id)
    rows = []  # (name, type, url, published, version)
    for i, n in enumerate(notices):
        pn, kind = n["publication-number"], n.get("notice-type") or ""
        label = notice_label(kind, i)
        rows.append((f"{label} — TED {pn}", "CORRIGENDUM" if label == "Change notice" else "CONTRACT_NOTICE",
                     f"https://ted.europa.eu/en/notice/{pn}/pdf", n["publication-date"][:10], str(i + 1)))
    if notices:
        # Day one of the procedure, even when the radar first saw a later notice.
        session.execute(text("""update opportunities set publication_date = cast(:d as timestamp)
                                where opportunity_id = :o
                                  and (publication_date is null or publication_date > cast(:d as timestamp))"""),
                        {"d": notices[0]["publication-date"][:10], "o": opportunity_id})

    # Document links live on the original notice. A deadline extension often
    # repeats them, and sometimes doesn't, so read every notice. A failed read
    # is not "this notice has no documents": the next run has to try again.
    portal_urls = []
    for n in notices:
        try:
            portal_urls += _notice_document_urls(n["publication-number"])
        except Exception:
            continue
    portal_urls = list(dict.fromkeys(portal_urls))
    # A TED rate limit is not "this tender has no dossier". Open the portal we already stored.
    for url in _portal_urls_on_record(session, opportunity_id):
        if url not in portal_urls:
            portal_urls.append(url)
    got_files = False
    gated_url = None
    partial = False
    known = {row.url for row in session.execute(text("select url from documents where opportunity_id = :o"),
                                                {"o": opportunity_id}).fetchall()}
    for url in portal_urls:
        partial = False
        host = urlparse(url).netloc
        found = []
        gated = False
        try:
            resolved = resolve_portal(url, known)
            found = resolved["files"]
            gated = resolved["gated"]
            partial = resolved["partial"]
        except Exception:
            found = []
        if found:
            rows += found
            got_files = True
            if not partial:
                continue
        if gated:
            gated_url = gated_url or url
            rows.append((f"Procurement documents (login required) — {host.removeprefix('www.')}",
                         "TENDER_SPECIFICATIONS", url, None, None))
            continue
        rows.append((f"Tender documents on {host.removeprefix('www.')}", "TENDER_SPECIFICATIONS", url, None, None))
    if gated_url and not got_files:
        note_gated_portal(session, opportunity_id, gated_url)

    had_any = session.execute(text("select count(*) from documents where opportunity_id = :o"),
                              {"o": opportunity_id}).scalar() > 0
    added = []
    new_names = []
    now = datetime.utcnow()
    for name, doc_type, url, published, version in rows:
        doc_id = f"{opportunity_id}-{hashlib.md5(f'{name}|{url}'.encode()).hexdigest()[:10]}"
        exists = session.execute(text("select document_id, url from documents where document_id = :d or (opportunity_id = :o and name = :n)"),
                                 {"d": doc_id, "o": opportunity_id, "n": name[:500]}).first()
        if exists:
            if exists.url != url[:1000]:  # same file, better link (e.g. a direct download)
                session.execute(text("update documents set url = :u where document_id = :d"), {"u": url[:1000], "d": exists.document_id})
            continue
        session.execute(text("""insert into documents (document_id, opportunity_id, name, document_type, url,
                                version, publication_date, downloaded_at)
                                values (:d, :o, :n, cast(:t as documenttype), :u, :v, :p, :now)"""),
                        {"d": doc_id, "o": opportunity_id, "n": name[:500], "t": doc_type, "u": url[:1000],
                         "v": version, "p": published, "now": now})
        added.append(name)
        if had_any and doc_type in config()["alert_on_new"]:
            new_names.append(name)
    retire_stale_analysis(session, opportunity_id)
    if added and had_any:
        lead = new_names[0] if new_names else added[0]
        desc = f"New document published: {lead}" if len(added) == 1 else f"{len(added)} new documents published, incl. {lead}"
        session.execute(text("""insert into change_events (opportunity_id, event_type, importance, description, detected_at, note_source)
                                values (:o, 'document_added', 'MATERIAL', :d, :now, :src)"""),
                        {"o": opportunity_id, "d": desc[:500], "now": now, "src": "New documents: " + "; ".join(added)[:1500]})
        session.execute(text("update opportunities set last_change = :now where opportunity_id = :o"), {"now": now, "o": opportunity_id})
    session.commit()
    return {"documents": len(rows), "new": new_names}


def _store_portal_file(session, opportunity_id: str, name: str, url: str, now, doc_type: str = None) -> bool:
    """Insert one harvested file. Returns whether a new row was written."""
    doc_id = f"{opportunity_id}-{hashlib.md5(f'{name}|{url}'.encode()).hexdigest()[:10]}"
    exists = session.execute(text("select document_id from documents where document_id = :d or (opportunity_id = :o and url = :u)"),
                             {"d": doc_id, "o": opportunity_id, "u": url[:1000]}).first()
    if exists:
        return False
    session.execute(text("""insert into documents (document_id, opportunity_id, name, document_type, url, downloaded_at)
                            values (:d, :o, :n, cast(:t as documenttype), :u, :now)"""),
                    {"d": doc_id, "o": opportunity_id, "n": name[:500], "t": doc_type or _portal_type(name),
                     "u": url[:1000], "now": now})
    return True


def repair_portal_stubs(session) -> dict:
    """Open the portal links already stored as 'Tender documents on …' and keep the public files.

    A link that needs a login is renamed and the summary says so. Nothing is posted
    as a change: these files were already on the notice when the link was stored.
    """
    rows = session.execute(text("""select document_id, opportunity_id, url, name from documents
                                   where name like 'Tender documents on %'""")).fetchall()
    opp_ids = list({r.opportunity_id for r in rows})
    before = _docs_for(session, opp_ids)
    stats = {"checked": len(rows), "files": 0, "inserted": 0, "removed": 0, "gated": 0, "unchanged": 0, "errors": 0}
    for row in rows:
        try:
            harvested = harvest_portal(row.url)
            clean = html.unescape(row.url or "").strip()
            if clean.startswith("http") and clean != row.url:
                session.execute(text("update documents set url = :u where document_id = :d"),
                                {"u": clean[:1000], "d": row.document_id})
            added = 0
            for name, link in harvested["files"]:
                if link in (row.url, clean):
                    session.execute(text("""update documents set name = :n, document_type = cast(:t as documenttype)
                                            where document_id = :d"""),
                                    {"n": name[:500], "t": _portal_type(name), "d": row.document_id})
                    added += 1
                    continue
                if _store_portal_file(session, row.opportunity_id, name, link, datetime.utcnow()):
                    added += 1
                    stats["inserted"] += 1
            complete = bool(harvested["files"]) and harvested["listed"] <= len(harvested["files"])
            replaced = any(link in (row.url, clean) for _, link in harvested["files"])
            if complete and not replaced:
                session.execute(text("delete from documents where document_id = :d"), {"d": row.document_id})
                stats["removed"] += 1
            elif harvested["gated"] and not harvested["files"]:
                host = urlparse(clean).netloc.lower().removeprefix("www.") or "portal"
                session.execute(text("update documents set name = :n where document_id = :d"),
                                {"n": f"Procurement documents (login required) — {host}"[:500], "d": row.document_id})
                note_gated_portal(session, row.opportunity_id, clean or row.url)
                stats["gated"] += 1
            elif not added:
                stats["unchanged"] += 1
            stats["files"] += added
            session.commit()
        except Exception:
            session.rollback()
            stats["errors"] += 1
    after = _docs_for(session, opp_ids)
    if after != before + stats["inserted"] - stats["removed"]:
        raise RuntimeError(f"portal repair changed documents by {after - before}, expected {stats['inserted'] - stats['removed']}")
    return stats


def _docs_for(session, opp_ids: list) -> int:
    if not opp_ids:
        return 0
    total = 0
    for start in range(0, len(opp_ids), 40):
        chunk = opp_ids[start:start + 40]
        marks = ", ".join(f":i{n}" for n in range(len(chunk)))
        total += session.execute(text(f"select count(*) from documents where opportunity_id in ({marks})"),
                                 {f"i{n}": opp for n, opp in enumerate(chunk)}).scalar()
    return total


def _publication_number(official: str, urls) -> str:
    if official and "ted.europa.eu" in official:
        tail = official.rstrip("/").split("/")[-1]
        if re.fullmatch(r"\d+-\d{4}", tail):
            return tail
    for url in urls:
        match = re.search(r"/notice/(\d+-\d{4})/", url or "")
        if match:
            return match.group(1)
    return ""


def gather_buyer_documents(session, published_active: bool = False) -> dict:
    """Download buyer files for tenders that still have none.

    published_active is the tenders page: open TED notices on any scope.
    The default remains every non-rejected tender outside General.
    A portal that needs a login is recorded as gated and left alone. Files that
    were already published are not announced as new.
    """
    if published_active:
        opps = session.execute(text("""
            select o.opportunity_id, o.official_url, o.reference
            from opportunities o
            where o.status = 'OPEN'
              and (o.deadline is null or o.deadline >= now())
              and (o.reference like 'TED:%' or o.official_url like '%ted.europa.eu%')
              and exists (
                select 1 from scope_items si
                where si.item_id = o.opportunity_id and si.item_type = 'tender')
              and not exists (
                select 1 from documents d
                where d.opportunity_id = o.opportunity_id
                  and d.name like 'Procurement documents (login required)%')
              and not exists (
                select 1 from documents d
                where d.opportunity_id = o.opportunity_id
                  and d.document_type in ('TENDER_SPECIFICATIONS','TECHNICAL_SPECIFICATIONS','FORM','ANNEX','CONTRACT','FINANCIAL_PROPOSAL','AWARD_CRITERIA','Q_AND_A','CLARIFICATION')
                  and d.name not like 'Tender documents on %'
                  and d.name not like 'Procurement documents (login required)%'
              )
        """)).fetchall()
    else:
        opps = session.execute(text("""
            select o.opportunity_id, o.official_url, o.reference
            from opportunities o
            where o.status <> 'REJECTED'
              and exists (
                select 1 from scope_items si
                join scopes s on s.id = si.scope_id
                where si.item_id = o.opportunity_id and si.item_type = 'tender' and s.is_default = false
              )
              and not exists (
                select 1 from documents d
                where d.opportunity_id = o.opportunity_id
                  and d.document_type in ('TENDER_SPECIFICATIONS','TECHNICAL_SPECIFICATIONS','FORM','ANNEX','CONTRACT','FINANCIAL_PROPOSAL','AWARD_CRITERIA','Q_AND_A','CLARIFICATION')
                  and d.name not like 'Tender documents on %'
                  and d.name not like 'Procurement documents (login required)%'
              )
        """)).fetchall()
    ids = [o.opportunity_id for o in opps]
    before = _docs_for(session, ids)
    stats = {"checked": len(opps), "inserted": 0, "with_files": 0, "gated": 0, "unchanged": 0, "errors": 0}
    for index, opp in enumerate(opps, start=1):
        if index == 1 or index % 25 == 0:
            print(f"progress {index}/{len(opps)}", flush=True)
        try:
            stored = session.execute(text("select url from documents where opportunity_id = :o"),
                                     {"o": opp.opportunity_id}).fetchall()
            known = {row.url for row in stored if row.url}
            portals = [html.unescape(row.url) for row in stored if row.url and "ted.europa.eu" not in row.url]
            if opp.official_url and "ted.europa.eu" not in opp.official_url:
                portals.append(opp.official_url)
            pubs = []
            if (opp.reference or "").startswith("TED:"):
                try:
                    pubs = [n["publication-number"] for n in _procedure_notices(opp.reference[4:])]
                except Exception:
                    pubs = []
            if not pubs:
                one = _publication_number(opp.official_url, known)
                pubs = [one] if one else []
            for pub in pubs:
                try:
                    portals.extend(_notice_document_urls(pub))
                except Exception:
                    pass
            portals = list(dict.fromkeys(html.unescape(u or "").strip() for u in portals))
            portals = [u for u in portals if u.startswith("http") and "ted.europa.eu" not in u]
            added = 0
            promoted = 0
            gated_url = None
            got = False
            for url in portals:
                resolved = resolve_portal(url, known)
                for name, doc_type, link, _published, _version in resolved["files"]:
                    if link in known:
                        # A portal page stored as a stub is the dossier once a reader can open it.
                        promoted += session.execute(text("""
                            update documents
                            set name = :n, document_type = cast(:t as documenttype), downloaded_at = :now
                            where opportunity_id = :o and url = :u and name like 'Tender documents on %'
                        """), {"n": name[:500], "t": doc_type, "now": datetime.utcnow(),
                               "o": opp.opportunity_id, "u": link[:1000]}).rowcount
                        got = True
                        continue
                    if _store_portal_file(session, opp.opportunity_id, name, link, datetime.utcnow(), doc_type):
                        added += 1
                        known.add(link)
                        got = True
                if resolved["gated"] and not resolved["files"]:
                    gated_url = gated_url or url
            if gated_url and not got:
                host = urlparse(gated_url).netloc.lower().removeprefix("www.") or "portal"
                label = f"Procurement documents (login required) — {host}"[:500]
                renamed = session.execute(text("""update documents set name = :n
                                        where opportunity_id = :o and name like 'Tender documents on %' and url = :u"""),
                                          {"n": label, "o": opp.opportunity_id, "u": gated_url[:1000]}).rowcount
                if not renamed and _store_portal_file(session, opp.opportunity_id, label, gated_url, datetime.utcnow()):
                    stats["inserted"] += 1
                note_gated_portal(session, opp.opportunity_id, gated_url)
                stats["gated"] += 1
            elif added or promoted:
                stats["with_files"] += 1
            else:
                stats["unchanged"] += 1
            stats["inserted"] += added
            if added or promoted:
                retire_stale_analysis(session, opp.opportunity_id)
            session.commit()
            if added or promoted or gated_url:
                print(f"gather {opp.opportunity_id} files={added + promoted} gated={bool(gated_url and not got)}", flush=True)
        except Exception as exc:
            session.rollback()
            stats["errors"] += 1
            print(f"gather {opp.opportunity_id} error {exc}"[:180], flush=True)
    after = _docs_for(session, ids)
    if after != before + stats["inserted"]:
        raise RuntimeError(f"buyer documents changed by {after - before}, expected {stats['inserted']}")
    return stats


def collect_missing(session, errors: list) -> dict:
    """Collect documents for TED tenders that have none yet.

    The full portal refresh runs once a day. A tender found later the same day
    would otherwise be summarised from the notice alone — often a deadline
    extension with no dossier. Those are collected on the next pipeline run.
    """
    opps = session.execute(text("""select opportunity_id, reference from opportunities
            where reference like 'TED:%'
              and not exists (select 1 from documents d where d.opportunity_id = opportunities.opportunity_id)""")).fetchall()
    total = 0
    for o in opps:
        try:
            total += collect_documents(session, o.opportunity_id, o.reference[4:])["documents"]
        except Exception as e:
            session.rollback()
            errors.append(f"documents {o.opportunity_id}: {e}"[:300])
    return {"opportunities": len(opps), "documents": total, "new": 0}


def collect_all(session, errors: list, only_active: bool = None) -> dict:
    """Refresh documents for tracked TED procurements (the active ones, unless the settings say otherwise)."""
    if only_active is None:
        only_active = bool(config()["only_active"])
    where = "reference like 'TED:%'" + (" and status in ('OPEN','SIGNAL') and (deadline is null or deadline >= now())" if only_active else "")
    opps = session.execute(text(f"select opportunity_id, reference from opportunities where {where}")).fetchall()
    total, new = 0, 0
    for o in opps:
        try:
            r = collect_documents(session, o.opportunity_id, o.reference[4:])
            total += r["documents"]
            new += len(r["new"])
        except Exception as e:
            session.rollback()
            errors.append(f"documents {o.opportunity_id}: {e}"[:300])
    return {"opportunities": len(opps), "documents": total, "new": new}
