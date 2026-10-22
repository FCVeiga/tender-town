"""
Tender documents — collects, for each tracked TED procurement, the list of
documents a bidder needs, with links that work from the site:

  - TED notice PDFs for every notice of the procedure (original + changes)
  - the buyer portal's own document list, where the portal shows it publicly:
      ePPS (Malta, Cyprus, Ireland, …): every file, with direct download links
      DTVP (Germany): every file by category, with direct download links
      ETHICS (Denmark and other Mercell ETHICS buyers): the public material API
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
    return list(dict.fromkeys(u for b in blocks for u in re.findall(r"<cbc:URI>([^<]+)</cbc:URI>", b)))


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


_DTVP_GROUPS = {"address": "TENDER_SPECIFICATIONS", "serviceDescription": "TECHNICAL_SPECIFICATIONS",
                "filledByCompany": "FORM", "contractCondition": "CONTRACT"}


def _dtvp_documents(url: str) -> list:
    """DTVP documents page: (file name, type hint, direct URL). The notice link
    redirects to the public project page; file links are relative to it."""
    r = _get(url)
    out = []
    for group, path in re.findall(r'href="\./documents/(\w+)/([^";]+)', r.text):
        if group == "archive":
            continue
        name = unquote_plus(unquote_plus(path))
        name = re.sub(r"\s*\(ID \d+\)", "", name)
        out.append((name, _DTVP_GROUPS.get(group), urljoin(r.url, html.unescape(f"./documents/{group}/{path}"))))
    return list({n: (n, h, u) for n, h, u in out}.values())


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


def _requires_login(url: str) -> bool:
    """The portal answered with a login wall. A login box in the header of a
    page that already lists the files is not one."""
    try:
        response = _get(url)
    except Exception:
        return False
    if response.status_code in (401, 403):
        return True
    if response.status_code != 200:
        return False
    final = (response.url or "").lower()
    if any(part in final for part in ("/login", "/signin", "/sign-in", "/logon")):
        return True
    body = (response.text or "")[:30000].lower()
    if 'type="password"' not in body and "type='password'" not in body:
        return False
    if re.search(r'href="[^"]+\.(pdf|docx|xlsx|zip)"', body):
        return False
    title = re.search(r"<title[^>]*>(.*?)</title>", body, re.S)
    headings = " ".join(re.findall(r"<h1[^>]*>(.*?)</h1>", body, re.S)[:2])
    label = re.sub(r"<[^>]+>", " ", f"{title.group(1) if title else ''} {headings}")
    return bool(re.search(r"\b(log ?in|sign ?in|log ind|anmelden|connexion)\b", label))


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
    read_failed = False
    for n in notices:
        try:
            portal_urls += _notice_document_urls(n["publication-number"])
        except Exception:
            read_failed = True
            continue
    portal_urls = list(dict.fromkeys(portal_urls))
    if read_failed and not portal_urls:
        raise RuntimeError(f"TED document links for {procedure_id} could not be read")
    got_files = False
    gated_url = None
    for url in portal_urls:
        host = urlparse(url).netloc
        found = []
        gated = False
        try:
            if "/epps/" in url and "listContractDocuments" in url:
                found = [(f"{title} — {fname}" if title and title.lower() not in fname.lower() else fname,
                          classify(f"{title} {fname}"), dl, None, None) for title, fname, dl in _epps_documents(url)]
            elif "dtvp.de" in host:
                found = [(name, hint or classify(name), dl, None, None) for name, hint, dl in _dtvp_documents(url)]
            elif "tender-details/" in url:
                from agents.official_notice import funding_documents
                found = [(name, hint or classify(name), dl, published, None)
                         for name, hint, dl, published in funding_documents(url.split("#")[0])]
            elif _ethics_tender_id(url):
                files, gated = _ethics_documents(url)
                found = [(name, hint, dl, published, None) for name, hint, dl, published in files]
            elif _requires_login(url):
                gated = True
        except Exception:
            found = []
        if found:
            rows += found
            got_files = True
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
    if added and had_any:
        lead = new_names[0] if new_names else added[0]
        desc = f"New document published: {lead}" if len(added) == 1 else f"{len(added)} new documents published, incl. {lead}"
        session.execute(text("""insert into change_events (opportunity_id, event_type, importance, description, detected_at, note_source)
                                values (:o, 'document_added', 'MATERIAL', :d, :now, :src)"""),
                        {"o": opportunity_id, "d": desc[:500], "now": now, "src": "New documents: " + "; ".join(added)[:1500]})
        session.execute(text("update opportunities set last_change = :now where opportunity_id = :o"), {"now": now, "o": opportunity_id})
    session.commit()
    return {"documents": len(rows), "new": new_names}


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
