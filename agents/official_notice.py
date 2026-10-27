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
from urllib.parse import quote, unquote, urljoin, urlparse, urlunparse

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
    # A government procurement notice, including one whose address has no number.
    if _gov_procurement_notice(url):
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


def demote_unopened(session) -> list:
    """An RFP whose own text says the call is not open yet is a signal.

    A TED contract notice is left alone. Returns the ids changed. The caller commits.
    """
    from database.models import Opportunity
    changed = []
    rows = session.query(Opportunity).filter(
        Opportunity.opportunity_type.in_(_TENDER_CATEGORIES),
        Opportunity.status.in_(["OPEN", "SIGNAL", "UNVERIFIED"]),
    ).all()
    for opp in rows:
        if (opp.reference or "").startswith("TED:"):
            continue
        if opp.status == "OPEN" and opp.deadline:
            continue
        blob = f"{opp.summary or ''}\n{opp.tender_summary or ''}"
        if not _unopened_call(blob, ""):
            continue
        opp.opportunity_type = "signal"
        if opp.status == "OPEN":
            opp.status = "SIGNAL"
        changed.append(opp.opportunity_id)
    return changed


def _active_cards(session):
    """Published, still-current tenders and signals, outside the matching itself."""
    return session.execute(text("""
        select o.opportunity_id, o.status, o.opportunity_type, o.country, o.reference,
               o.deadline, o.authority, o.authority_en, o.official_url,
               coalesce(o.title_en, o.title) as title, o.first_detected
        from opportunities o
        where o.status in ('OPEN', 'SIGNAL')
          and (o.deadline is null or o.deadline >= now())
          and exists (
            select 1 from scope_items si
            join scopes s on s.id = si.scope_id and s.is_default = false
            where si.item_type = 'tender' and si.item_id = o.opportunity_id)
    """)).fetchall()


def duplicate_groups(session) -> list:
    """Clusters of active cards that are one purchase. Each cluster is a list of ids."""
    from services.deduplicator import (
        capitalised_bigrams, capitalised_tokens, conflicting_references, content_stems, same_notice,
    )
    rows = list(_active_cards(session))
    parent = {row.opportunity_id: row.opportunity_id for row in rows}

    def find(item):
        while parent[item] != item:
            parent[item] = parent[parent[item]]
            item = parent[item]
        return item

    def unite(left, right):
        left, right = find(left), find(right)
        if left != right:
            parent[right] = left

    by_country = {}
    for row in rows:
        by_country.setdefault(row.country or "", []).append(row)
    for group in by_country.values():
        frequency = {}
        phrases = {}
        stems = {}
        for row in group:
            for word in capitalised_tokens(row.title):
                frequency[word] = frequency.get(word, 0) + 1
            for phrase in capitalised_bigrams(row.title):
                phrases[phrase] = phrases.get(phrase, 0) + 1
            for stem in content_stems(row.title):
                stems[stem] = stems.get(stem, 0) + 1
        rare = {word for word, count in frequency.items() if count <= 2}
        rare_phrases = {phrase for phrase, count in phrases.items() if count <= 4}
        rare_stems = {stem for stem, count in stems.items() if count <= 3}
        for index, left in enumerate(group):
            for right in group[index + 1:]:
                if conflicting_references(left.reference, right.reference):
                    continue
                if same_notice(left.title, right.title, left.country, right.country,
                               left.reference, right.reference,
                               left.authority_en or left.authority or "",
                               right.authority_en or right.authority or "",
                               rare, rare_phrases, rare_stems):
                    unite(left.opportunity_id, right.opportunity_id)
    shared = session.execute(text("""
        select d.url, array_agg(distinct d.opportunity_id) as ids
        from documents d
        join opportunities o on o.opportunity_id = d.opportunity_id
        where o.status in ('OPEN', 'SIGNAL')
          and d.url not ilike '%ted.europa.eu%'
          and d.url not ilike '%media-kit%'
          and d.name not ilike '%media kit%'
          and d.name not like 'Tender documents on %'
          and d.name not like 'Procurement documents (login required)%'
        group by d.url
        having count(distinct d.opportunity_id) > 1
    """)).fetchall()
    known = set(parent)
    for row in shared:
        ids = [item for item in row.ids if item in known]
        for item in ids[1:]:
            if not conflicting_references(
                next((card.reference for card in rows if card.opportunity_id == ids[0]), ""),
                next((card.reference for card in rows if card.opportunity_id == item), ""),
            ):
                unite(ids[0], item)
    clusters = {}
    for item in parent:
        clusters.setdefault(find(item), []).append(item)
    return [sorted(ids) for ids in clusters.values() if len(ids) > 1]


def _keeper(session, ids: list) -> str:
    """The record that already has the notice, the deadline, or the files."""
    scored = []
    for item in ids:
        row = session.execute(text("""
            select reference, deadline, status,
                   (select count(*) from documents d where d.opportunity_id = :i
                      and d.name not ilike '%media kit%' and d.url not ilike '%media-kit%') as files
            from opportunities where opportunity_id = :i
        """), {"i": item}).first()
        score = 0
        if (row.reference or "").startswith("TED:"):
            score += 100
        if row.deadline:
            score += 40
        if row.status == "OPEN":
            score += 10
        score += min(int(row.files or 0), 20)
        scored.append((score, item))
    scored.sort(reverse=True)
    return scored[0][1]


def _repoint(session, loser: str, keeper: str) -> None:
    """Move what the duplicate card held onto the one we keep. No new change event."""
    session.execute(text("""
        insert into item_sources (item_type, item_id, url, title, source_name, published_at)
        select 'tender', :keeper, official_url, left(coalesce(title_en, title), 500),
               left(split_part(replace(official_url, 'https://', ''), '/', 1), 200), null
        from opportunities
        where opportunity_id = :loser and coalesce(official_url, '') <> ''
        on conflict (item_type, item_id, url) do nothing
    """), {"keeper": keeper, "loser": loser})
    session.execute(text("""
        insert into item_sources (item_type, item_id, url, title, source_name, published_at)
        select item_type, :keeper, url, title, source_name, published_at
        from item_sources where item_type = 'tender' and item_id = :loser
        on conflict (item_type, item_id, url) do nothing
    """), {"keeper": keeper, "loser": loser})
    session.execute(text("delete from item_sources where item_type = 'tender' and item_id = :loser"), {"loser": loser})
    session.execute(text("""
        delete from documents d
        where d.opportunity_id = :loser
          and exists (select 1 from documents k where k.opportunity_id = :keeper and k.url = d.url)
    """), {"loser": loser, "keeper": keeper})
    session.execute(text("update documents set opportunity_id = :keeper where opportunity_id = :loser"),
                    {"keeper": keeper, "loser": loser})
    session.execute(text("""
        update scope_items keep
        set relevance = greatest(keep.relevance, drop.relevance)
        from scope_items drop
        where keep.item_type = 'tender' and drop.item_type = 'tender'
          and keep.item_id = :keeper and drop.item_id = :loser
          and keep.scope_id = drop.scope_id
    """), {"keeper": keeper, "loser": loser})
    session.execute(text("""
        delete from scope_items drop
        where drop.item_type = 'tender' and drop.item_id = :loser
          and exists (
            select 1 from scope_items keep
            where keep.item_type = 'tender' and keep.item_id = :keeper and keep.scope_id = drop.scope_id)
    """), {"keeper": keeper, "loser": loser})
    session.execute(text("update scope_items set item_id = :keeper where item_type = 'tender' and item_id = :loser"),
                    {"keeper": keeper, "loser": loser})
    for table in ("change_events", "award_criteria", "requirements", "opportunity_snapshots",
                  "partners", "reference_requirements", "team_requirements", "digest_entries"):
        session.execute(text(f"update {table} set opportunity_id = :keeper where opportunity_id = :loser"),
                        {"keeper": keeper, "loser": loser})
    session.execute(text("""
        delete from scope_evaluations drop
        where drop.opportunity_id = :loser
          and exists (
            select 1 from scope_evaluations keep
            where keep.opportunity_id = :keeper and keep.scope_id = drop.scope_id
              and keep.workspace_id is not distinct from drop.workspace_id)
    """), {"keeper": keeper, "loser": loser})
    session.execute(text("update scope_evaluations set opportunity_id = :keeper where opportunity_id = :loser"),
                    {"keeper": keeper, "loser": loser})
    session.execute(text("update feed_posts set opportunity_id = :keeper where opportunity_id = :loser"),
                    {"keeper": keeper, "loser": loser})
    session.execute(text("""
        delete from likes drop
        where drop.item_type = 'tender' and drop.item_id = :loser
          and exists (
            select 1 from likes keep
            where keep.item_type = 'tender' and keep.item_id = :keeper and keep.user_id = drop.user_id)
    """), {"keeper": keeper, "loser": loser})
    session.execute(text("update likes set item_id = :keeper where item_type = 'tender' and item_id = :loser"),
                    {"keeper": keeper, "loser": loser})
    session.execute(text("delete from opportunities where opportunity_id = :loser"), {"loser": loser})


def promote_documented(session) -> list:
    """An open call with a deadline and a real bidding file is an RFP.

    A market engagement whose text says the call is not open stays a signal.
    Returns the ids changed. The caller commits.
    """
    from database.models import Opportunity
    changed = []
    rows = session.execute(text("""
        select o.opportunity_id
        from opportunities o
        where o.status = 'OPEN' and o.opportunity_type = 'signal' and o.deadline is not null
          and exists (
            select 1 from documents d
            where d.opportunity_id = o.opportunity_id
              and d.name not ilike '%media kit%'
              and coalesce(d.url, '') not ilike '%media-kit%'
              and d.name not like 'Tender documents on %'
              and d.name not like 'Procurement documents (login required)%')
    """)).fetchall()
    for row in rows:
        opp = session.get(Opportunity, row.opportunity_id)
        if opp is None or _unopened_call(f"{opp.summary or ''}\n{opp.tender_summary or ''}", ""):
            continue
        opp.opportunity_type = "rfp"
        changed.append(opp.opportunity_id)
    return changed


def fold_duplicates(session) -> list:
    """Keep one card per purchase. Returns the ids that were folded away. The caller commits."""
    removed = []
    for cluster in duplicate_groups(session):
        keeper = _keeper(session, cluster)
        for loser in cluster:
            if loser == keeper:
                continue
            _repoint(session, loser, keeper)
            removed.append(loser)
    return removed


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
# A single notice on a government site. The listing (/procurement-notices) is not one.
_NOTICE_PATH = re.compile(
    r"/(?:procurement-notices|procurement-notice|tender-notices)/[^/?#]{3,}",
    re.I,
)
_MEDIA_UUID = re.compile(
    r"/media/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
    re.I,
)
_SKIP_HOSTS = (
    "facebook.com", "twitter.com", "x.com", "linkedin.com", "instagram.com",
    "youtube.com", "tiktok.com", "t.co", "google.com", "apple.com",
    "play.google.com", "bit.ly", "goo.gl", "googleapis.com", "gstatic.com",
)
_NOTICE_INDEXES = ("/procurement-notices", "/procurement-notice", "/tender-notices")


def _gov_procurement_notice(url: str) -> bool:
    """A buyer notice page, not the list of every notice on that site."""
    host = _host(url)
    if not host or not _GOV_HOST.search(host):
        return False
    path = (urlparse(url).path or "").rstrip("/")
    if path.count("/") < 2:
        return False
    return bool(_NOTICE_PATH.search(path))


def _gov_file(url: str) -> bool:
    """A file on a government host, including one served from /media/{id} with no extension."""
    host = _host(url)
    if not host or not _GOV_HOST.search(host):
        return False
    path = urlparse(url).path or ""
    return bool(_FILE_URL.search(path) or _MEDIA_UUID.search(path))


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
        if re.search(r"media[- ]kit", blob, re.I):
            continue
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


def _element_body(html: str, open_pattern: str, tag: str) -> str:
    match = re.search(open_pattern, html or "", re.I)
    if not match:
        return ""
    start = match.end()
    depth = 1
    for found in re.finditer(rf"<{tag}\b|</{tag}>", html[start:], re.I):
        depth += -1 if found.group(0).startswith("</") else 1
        if depth == 0:
            return html[start:start + found.start()]
    return ""


def _article_chunk(html: str) -> str:
    """The article body. A related-stories rail sits outside it."""
    body = _element_body(html, r"<div\b[^>]*class=[\"'][^\"']*\bthecontent\b[^\"']*[\"'][^>]*>", "div")
    if len(re.sub(r"<[^>]+>", " ", body)) > 400:
        return body
    body = _element_body(html, r"<article\b[^>]*>", "article")
    if len(re.sub(r"<[^>]+>", " ", body)) > 400:
        return body
    return html or ""


def _paragraph_links(html: str, base: str) -> list:
    links = []
    for para in re.findall(r"<p\b[^>]*>(.*?)</p>", html or "", re.I | re.S):
        for href in re.findall(r"""href=["']([^"'#]+)""", para, re.I):
            absolute = urljoin(base, html_lib.unescape(href.strip())).split("#")[0]
            if absolute.startswith("http") and absolute not in links:
                links.append(absolute)
    return links


def _mentions_deadline(*parts) -> bool:
    return bool(re.search(r"\bdeadlines?\b", " ".join(part or "" for part in parts), re.I))


def _cited_article(url: str, page_url: str) -> bool:
    """A report the article cites, not a share button or another story on the same site."""
    host = _host(url)
    page = _host(page_url)
    if not host or host == page or host.endswith("." + page) or page.endswith("." + host):
        return False
    if any(host == skip or host.endswith("." + skip) for skip in _SKIP_HOSTS):
        return False
    if _gov_file(url) or _gov_procurement_notice(url) or is_portal_url(url):
        return False
    path = urlparse(url).path or ""
    return path.count("/") >= 2 and len(path.rstrip("/")) > 12


def _notice_for_file(file_url: str):
    """The notice page that lists this government file, when the article linked the file only."""
    parsed = urlparse(file_url)
    match = _MEDIA_UUID.search(parsed.path or "")
    if not match or not _GOV_HOST.search(_host(file_url)):
        return None
    token = match.group(1).lower()
    origin = f"{parsed.scheme}://{parsed.netloc}"
    for index in _NOTICE_INDEXES:
        try:
            listing = _get(origin + index)
        except Exception:
            continue
        notices = []
        for href in re.findall(r"""href=["']([^"'#]+)""", listing, re.I):
            absolute = urljoin(origin + index, html_lib.unescape(href.strip())).split("#")[0].split("?")[0].rstrip("/")
            if _host(absolute) != _host(file_url) or not _gov_procurement_notice(absolute):
                continue
            if absolute not in notices:
                notices.append(absolute)
        for notice in notices[:20]:
            try:
                page = _get(notice)
            except Exception:
                continue
            if token in page.lower():
                return notice
        if notices:
            break
    return None


def _notice_from_links(links: list):
    notice = next((link for link in links if _gov_procurement_notice(link)), None)
    files = [link for link in links if _gov_file(link)]
    portal = notice
    if not portal and files:
        portal = _notice_for_file(files[0]) or files[0]
    if not portal:
        portal = next((link for link in links if is_portal_url(link)), None)
    if not portal:
        return None
    if _gov_procurement_notice(portal):
        parsed = urlparse(portal)
        portal = urlunparse(parsed._replace(query="", fragment="")).rstrip("/")
    else:
        portal = portal.split("#")[0]
    return {
        "portal_url": portal,
        "procedure": None, "publication": None, "title": None, "deadline": None,
        "value": None, "currency": None, "country": None,
    }


def _chase_buyer_notice(source_url: str, html: str):
    """Read the article, then the report it cites, and take the buyer's notice.

    Links come from the article paragraphs, so a sidebar story cannot supply
    a different purchase. One hop is enough: the cited report is the original.
    """
    if not html or not source_url:
        return None
    prose = _paragraph_links(_article_chunk(html), source_url)
    found = _notice_from_links(prose)
    if found:
        return found
    for link in [url for url in prose if _cited_article(url, source_url)][:2]:
        try:
            page = _get(link)
        except Exception:
            continue
        found = _notice_from_links(_paragraph_links(_article_chunk(page), link))
        if found:
            return found
    return None


def find_official(source_url: str, text: str = "", country: str = None, headline: str = None,
                  follow_links: bool = True, page: str = None):
    """The portal record for a tender first seen at source_url, or None.

    follow_links is for a page that is itself about one purchase. A news
    article's sidebar can point at a different notice, so that path stays off.
    page is the article HTML when the caller already fetched it.
    A deadline is a reason to read the cited report and the buyer notice it
    points at, which is a narrower follow than the sidebar.
    """
    html = page
    if html is None:
        html = ""
        if source_url and not is_portal_url(source_url):
            try:
                html = _get(source_url)
            except Exception:
                html = ""
    if _mentions_deadline(text, _plain(html)):
        chased = _chase_buyer_notice(source_url or "", html)
        if chased and chased.get("portal_url"):
            return chased
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
_MONTH_DAY = re.compile(r"\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b")
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
    for month, day, year in _MONTH_DAY.findall(sentence):
        number = _MONTHS.get(month.lower())
        if number:
            found.append((int(year), number, int(day)))
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
    r"Invitation to Bid for|Invitation to Tender|Call for Tenders|Appel d'offres|Pliego de|"
    r"Règlement de la consultation|Objet du marché|date limite de réception|"
    r"Request for (?:Supplier )?Qualifications",
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
            if dated.search(text) and re.search(
                r"deadline|pre-bid|submission of bids|Approved Budget|date limite|remise des (?:plis|offres)|pouvoir adjudicateur",
                text, re.I,
            ):
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


def _figures(text: str) -> set:
    found = set()
    for raw in re.findall(r"\d[\d\s\u00a0.,]*\d|\d", text or ""):
        digits = re.sub(r"\D", "", raw)
        if digits:
            found.add(digits)
            found.add(digits.lstrip("0") or "0")
    return found


def _grounded_summary(summary: str, excerpt: str) -> str:
    """Keep a sentence only when the document supports it.

    A bidding file says "one (1) year". A model that turns that into a payment
    model writes words the file never uses, and those sentences are dropped.
    A translation does not share the document's vocabulary, so its sentences
    stay when every figure they state is in the file.
    """
    source = (excerpt or "").lower()
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
    grounded = "\n\n".join(paragraphs)
    if grounded:
        return grounded
    figures = _figures(excerpt)
    translated = []
    for para in re.split(r"\n\s*\n", (summary or "").strip()):
        kept = []
        for sentence in re.split(r"(?<=[.!?])\s+", para.strip()):
            stated = _figures(sentence)
            if stated and any(number not in figures for number in stated):
                continue
            if sentence.strip():
                kept.append(sentence.strip())
        if kept:
            translated.append(" ".join(kept))
    return "\n\n".join(translated)


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


_UNOPENED = re.compile(
    r"early market engagement|not yet a formal tender|"
    r"not yet (?:been )?(?:issued|released|opened)|"
    r"(?:tender|call|request for proposals|\brfp\b|procurement) (?:is |has )?not yet (?:been )?published|"
    r"prior information notice|market engagement|"
    r"request for proposals? (?:is |will be )?expected|expected to issue|"
    r"ahead of (?:the |a )?(?:formal )?(?:request for proposals|tender|\brfp\b)|"
    r"preparing to procure|the tender is not open|has not opened",
    re.I,
)


def _unopened_call(summary: str, excerpt: str) -> bool:
    """True when the text is a plan or a market sounding, not a call that is open for bids."""
    return bool(_UNOPENED.search(f"{summary or ''}\n{excerpt or ''}"))


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
    if deadline and not _unopened_call(summary, ""):
        stated = set(_dates_in(summary))
        model_day = (deadline.year, deadline.month, deadline.day)
        existing = _deadline_parts(opp.deadline)
        # A date the summary never states is the model's, not the document's.
        # When the summary states both the date already stored and another day,
        # the stored day stays: the other is often when the files are opened.
        if model_day not in stated or (existing and existing != model_day and existing in stated):
            deadline = None
    if deadline and not _unopened_call(summary, ""):
        opp.deadline = deadline
        opp.status = "OPEN" if deadline >= now else "CLOSED"
        opp.status_evidence = f"The bidding documents set the submission deadline at {deadline.strftime('%d %B %Y').lstrip('0')}."
        if opp.opportunity_type == "signal":
            opp.opportunity_type = "rfp"
    elif _unopened_call(summary, ""):
        # An early market engagement or a prior notice is not an open call.
        opp.opportunity_type = "signal"
        opp.deadline = None
        if opp.status == "OPEN":
            opp.status = "SIGNAL"
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
    return len(added)


def _cover_summary(excerpt: str) -> dict:
    """A short summary copied from the cover when the model summary is empty."""
    text = re.sub(r"[ \t]+", " ", excerpt or "")
    title = re.search(
        r"(Request for (?:Supplier )?Qualifications(?:\s+No\.:\s*[A-Z0-9][A-Z0-9/-]{2,40})?)",
        text,
    )
    deadline_line = re.search(
        r"Submission Deadline:?\s*([A-Za-z]+,?\s+[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2}"
        r"(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)?)",
        text,
    )
    if not title or not deadline_line:
        return {}
    buyer = re.search(r"((?:Ministry|Department|Municipality|Government) of [A-Z][A-Za-z &'-]{2,80})", text)
    who = re.split(r"\s{2,}| Page ", buyer.group(1).strip())[0].strip(" ,") if buyer else ""
    number = re.search(r"No\.:\s*([A-Z0-9][A-Z0-9/-]{2,40})", title.group(1))
    when = deadline_line.group(1).strip().rstrip(" .,")
    lead = f"{who} has issued a {title.group(1).strip()}." if who else f"The buyer has issued a {title.group(1).strip()}."
    sentences = [lead, f"The submission deadline is {when}."]
    if "required to register their interest" in text.lower():
        sentences.append("Respondents that intend to respond are required to register their interest with the contact named in the documents.")
    dates = _dates_in(when)
    iso = f"{dates[-1][0]:04d}-{dates[-1][1]:02d}-{dates[-1][2]:02d}" if dates else None
    return {
        "summary": " ".join(sentences),
        "title": title.group(1).strip()[:180],
        "buyer": who or None,
        "deadline": iso,
        "reference": number.group(1) if number else None,
        "value": None,
        "currency": None,
    }


def _sync_feed(session, opp) -> None:
    """A card that was posted as a signal is the tender once the notice is attached."""
    if (opp.opportunity_type or "") == "signal":
        return
    headline = re.sub(r"\s+", " ", (opp.title_en or opp.title or "")).strip()
    if not headline:
        return
    session.execute(text("""
        update feed_posts
        set category = 'rfp', headline = :h, body = :b
        where opportunity_id = :o and category = 'signal'
    """), {"o": opp.opportunity_id, "h": headline[:500], "b": (opp.summary or "")[:8000]})


def _keep_buyer_files(session, opp) -> int:
    """Store the public files on a buyer notice that is not a TED procedure.

    Nothing is posted as a change: the files were already on the notice.
    Returns how many files the notice gave up. The caller commits.
    """
    from agents.tender_documents import harvest_portal, _store_portal_file
    url = (opp.official_url or "").strip()
    if not url.startswith("http"):
        return 0
    harvested = harvest_portal(url)
    if not harvested["files"]:
        return 0
    now = datetime.utcnow()
    added = 0
    for name, link in harvested["files"]:
        if _store_portal_file(session, opp.opportunity_id, name, link, now):
            added += 1
    described = {}
    for _name, link in harvested["files"]:
        try:
            response = requests.get(link, headers=UA, timeout=40)
        except Exception:
            continue
        data = response.content or b""
        if response.status_code != 200 or not data.startswith(b"%PDF") or len(data) > 30_000_000:
            continue
        try:
            described = _summarize_bid(data) or {}
        except Exception:
            described = {}
        if not described.get("summary"):
            described = _cover_summary(_pdf_excerpt(data))
        if described.get("summary"):
            excerpt = _pdf_excerpt(data)
            if ("required to register their interest" in excerpt.lower()
                    and "register" not in (described.get("summary") or "").lower()):
                described["summary"] = (described["summary"].rstrip()
                    + " Respondents that intend to respond are required to register their interest with the RFSQ Contact.")
            break
    if described.get("summary"):
        _apply_bid_summary(opp, described, now)
    if opp.opportunity_type == "signal" and not _unopened_call(opp.summary or "", ""):
        opp.opportunity_type = "rfp"
        deadline = opp.deadline.replace(tzinfo=None) if getattr(opp.deadline, "tzinfo", None) else opp.deadline
        if opp.status == "SIGNAL" and deadline and deadline >= now:
            opp.status = "OPEN"
    _sync_feed(session, opp)
    return added or len(harvested["files"])


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
            elif not has_requirement_documents(session, opp.opportunity_id):
                try:
                    if _keep_buyer_files(session, opp):
                        session.commit()
                        linked += 1
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
        else:
            try:
                _keep_buyer_files(session, opp)
                session.commit()
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
        else:
            try:
                if _keep_buyer_files(session, existing):
                    session.commit()
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
