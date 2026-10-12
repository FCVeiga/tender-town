"""
Source monitor — checks every followed source on its own schedule and feeds
what it finds into the radar.

Each row of `sources` (edited from the site's Following sidebar) says how:
  ted          TED search API — handled by Discovery, skipped here
  api          a source API (World Bank, national portals, EBRD) — handled by Discovery, skipped here
  rss          RSS/Atom feed at feed_url
  site_search  web search restricted to the source's domain (Tavily) — for
               portals and government sites without a feed
  off          listed only

A source is due when it hasn't been checked for check_every_days. Findings
land in source_activity (the site's Live activity panel) and are then turned
into Candidates for triage: items from news/social sources go to the "news"
pack (eligible for the News page), everything else to "web".
"""
import hashlib
import html
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from types import SimpleNamespace
from urllib.parse import urlparse

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "database"))
from models import Candidate, Source, SourceActivity  # noqa: E402

UA = {"User-Agent": "TenderTown/1.0 (+https://tendertown.io; RSS reader)"}
ITEMS_PER_FEED = 15
SITE_QUERY = "EUDI wallet digital identity wallet eIDAS electronic identification tender procurement"
_LANG = None


# Generic scopes (General): what to look for on a source's site, by kind of source.
GENERIC_QUERIES = {
    "NEWS": "software development public sector contract tender Europe",
    "INDUSTRY_SOURCE": "software company public contract awarded Europe",
    "DEVELOPMENT_BANK": "digital software procurement project",
    "FUNDING_PORTAL": "software digital call for proposals grant open",
    "EU_PROGRAMME": "software digital call for proposals grant",
    "DIGITAL_AGENCY": "software digital public service tender",
    "STANDARDS_BODY": "software interoperability standard",
    "PROCUREMENT_PORTAL": "software development tender contract notice",
}


def site_query(country, cfg=None) -> str:
    """Search in the source's own language(s) as well as English (config/languages.yaml).
    cfg: the following scope's search configuration (default scope's when not given)."""
    global _LANG
    if _LANG is None:
        import yaml
        with open(os.path.join(os.path.dirname(__file__), "..", "config", "languages.yaml")) as f:
            _LANG = yaml.safe_load(f)
    langs = [l for l in _LANG["country_languages"].get(country or "", []) if l != "en"]
    local = " ".join(p for l in langs[:2] for p in _LANG["phrases"].get(l, [])[1:3])
    if cfg is None:
        from services.agent_settings import search_config
        cfg = search_config()
    custom = cfg.get("site_query")
    if custom:  # the scope's search configuration replaces the EUDI default, local-language phrases included
        own = cfg.get("local_phrases") or {}
        return f"{' '.join(p for l in langs[:2] for p in own.get(l, [])[:2])} {custom}".strip()
    return f"{local} EUDI eIDAS {SITE_QUERY}".strip()
NEWS_TYPES = {"NEWS", "INDUSTRY_SOURCE", "SOCIAL_TWITTER", "SOCIAL_LINKEDIN", "SOCIAL_REDDIT"}


def _type(s: Source) -> str:
    return getattr(s.source_type, "value", s.source_type)


def is_due(s: Source, now: datetime) -> bool:
    last = s.last_checked.replace(tzinfo=None) if s.last_checked else None
    # an hour of slack so a daily source isn't skipped by a slightly earlier run
    return last is None or now - last >= timedelta(days=s.check_every_days or 7) - timedelta(hours=1)


def _strip(text: str) -> str:
    text = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", text or "", flags=re.S)
    return html.unescape(re.sub(r"<[^>]+>", " ", text)).strip()


def _date(text):
    if not text:
        return None
    from email.utils import parsedate_to_datetime
    try:
        return parsedate_to_datetime(text).replace(tzinfo=None)           # RSS: RFC 822
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(text.strip().replace("Z", "+00:00")).replace(tzinfo=None)  # Atom: ISO 8601
    except ValueError:
        return None


def parse_feed(xml: str) -> list:
    """Items of an RSS 2.0 / RSS 1.0 / Atom feed, newest first as published."""
    items = []
    for block in re.findall(r"<(item|entry)[\s>](.*?)</\1>", xml, re.S | re.I)[:ITEMS_PER_FEED]:
        body = block[1]
        tag = lambda name: (m.group(1) if (m := re.search(rf"<{name}[^>]*>(.*?)</{name}>", body, re.S | re.I)) else "")
        link = tag("link") or ""
        if not link.strip():
            href = re.search(r'<link[^>]+href=["\']([^"\']+)', body, re.I)
            link = href.group(1) if href else ""
        title, link = _strip(tag("title")), _strip(link)
        if not title:
            continue
        items.append({
            "external_id": _strip(tag("guid") or tag("id")) or link or title,
            "title": title[:500], "url": link or None,
            "summary": _strip(tag("description") or tag("summary") or tag("content"))[:1000] or None,
            "published_at": _date(_strip(tag("pubDate") or tag("published") or tag("updated") or tag("dc:date"))),
        })
    return items


def check_rss(s) -> list:
    r = requests.get(s.feed_url, headers=UA, timeout=30)
    r.raise_for_status()
    return parse_feed(r.text)


def check_site(s, tavily) -> list:
    domain = urlparse(s.url or "").netloc.removeprefix("www.")
    if not domain:
        raise ValueError("no URL to search")
    res = tavily.client.search(query=s.query, include_domains=[domain], max_results=8,
                               search_depth="basic", time_range="month")
    return [{"external_id": i["url"], "title": (i.get("title") or i["url"])[:500], "url": i["url"],
             "summary": (i.get("content") or "")[:1000] or None, "published_at": _date(i.get("published_date"))}
            for i in res.get("results", [])]


def check_sources(session, errors: list, now=None, follow=None) -> dict:
    """Check every enabled source that is due — only those a running scope
    follows, when `follow` ({source_id: [scope, ...]}) is given. A site search
    uses the search terms of a following industry scope, or generic terms by
    kind of source when only generic scopes follow it. Returns counts for the digest."""
    now = now or datetime.utcnow()
    tavily = None
    if os.environ.get("TAVILY_API_KEY"):
        from adapters.tavily import TavilySearchProvider
        tavily = TavilySearchProvider()
    due = [s for s in session.query(Source).filter(Source.enabled.is_(True), Source.method.in_(["rss", "site_search"]))
           if is_due(s, now) and (s.method == "rss" or tavily) and (follow is None or s.source_id in follow)]

    def query_for(s):
        scopes = (follow or {}).get(s.source_id) or []
        industry = [sc for sc in scopes if (sc.search or {}).get("mode") != "generic"]
        if industry or not scopes:
            return site_query(s.country, industry[0].search or {} if industry else None)
        return GENERIC_QUERIES.get(_type(s), "announcement news")

    # Workers get detached copies: ORM objects expire on every commit and
    # must not be lazy-loaded from other threads.
    jobs = [SimpleNamespace(source_id=s.source_id, method=s.method, feed_url=s.feed_url, url=s.url, country=s.country,
                            query=query_for(s) if s.method == "site_search" else None)
            for s in due]

    def run(job):
        try:
            return job.source_id, (check_rss(job) if job.method == "rss" else check_site(job, tavily)), None
        except Exception as e:
            return job.source_id, [], e

    by_id = {s.source_id: s for s in due}
    found = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        for sid, items, err in pool.map(run, jobs):
            s = by_id[sid]
            s.last_checked = now
            if err:
                s.last_error = f"{type(err).__name__}: {err}"[:300]
                errors.append(f"source {s.name}: {s.last_error}")
            else:
                s.last_error, s.last_successful_check, s.number_results_last_run = None, now, len(items)
                have = {x for (x,) in session.query(SourceActivity.external_id).filter_by(source_id=sid)}
                for it in items:
                    key = it["external_id"][:1000]
                    if key in have:
                        continue
                    have.add(key)
                    session.add(SourceActivity(source_id=sid, external_id=key, title=it["title"], url=it["url"],
                                               summary=it["summary"], published_at=it["published_at"] or now,
                                               fetched_at=now))
                    found += 1
            session.commit()
    total = [s.source_id for s in session.query(Source).filter(Source.enabled.is_(True), Source.method != "off")]
    return {"checked": len(due), "found": found,
            "total": len([x for x in total if follow is None or x in follow])}


def ingest_activity(session) -> int:
    """Turn new activity into Candidates for triage (deduplicated)."""
    sources = {s.source_id: s for s in session.query(Source)}
    added = 0
    for a in session.query(SourceActivity).filter(SourceActivity.ingested.is_(False)).order_by(SourceActivity.id):
        s = sources.get(a.source_id)
        cid = hashlib.sha256(f"{a.url}|{a.title}".encode()).hexdigest()[:16]  # same key as Discovery
        if a.url and a.title and not session.get(Candidate, cid):
            session.add(Candidate(
                candidate_id=cid, discovered_at=datetime.utcnow(), source_id=a.source_id, source_url=a.url,
                title=a.title, description=a.summary or a.title, country=s.country if s else None,
                publication_date=a.published_at, discovery_query=f"followed source: {s.name if s else a.source_id}",
                potential_categories=["news" if s and _type(s) in NEWS_TYPES else "web"], processed=False,
            ))
            added += 1
        a.ingested = True
    session.commit()
    return added


def mark_relevance(session) -> None:
    """After triage: flag activity whose candidate cleared the bar (so the site
    shows site-search finds only when they matter), and copy what triage found
    it to be and its English title (Live activity wording)."""
    from sqlalchemy import text
    session.execute(text("""
        update source_activity a set relevant = (c.relevance >= 50
               or coalesce((c.triage_output->>'importance')::int, 0) >= 50),
               kind = c.candidate_type,
               title_en = nullif(c.triage_output->>'title_en', '')
        from candidates c
        where a.relevant is null and c.processed and c.source_url = a.url and c.source_id = a.source_id"""))
    session.commit()

