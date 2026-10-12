"""
Agent 1 — Discovery.

Purpose: extremely broad search at low computational cost. Maximum recall.
False positives acceptable; false negatives are not. Do NOT do full tender
analysis here — that's Agent 3 (document_analyser.py).
"""
import hashlib
import sys
import os
from datetime import datetime
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "database"))
from models import Candidate, get_session  # noqa: E402


def _candidate_id(source_url: str, title: str) -> str:
    return hashlib.sha256(f"{source_url}|{title}".encode()).hexdigest()[:16]


def _parse_date(value):
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d") if value else None
    except ValueError:
        return None


def run_discovery(session, search_provider, query_packs: dict, countries: list,
                  errors: Optional[list] = None, found: Optional[set] = None,
                  source_id: Optional[str] = None):
    """Run every query in query_packs. A failing query is recorded in
    `errors` (when given) and skipped, so one bad source can't sink the run.
    `found` (when given) collects the id of every result, already known or
    not — a scope triages what its own searches turn up. `source_id` stamps
    new candidates with the registry row that produced them."""
    new_candidates = []
    seen = set()
    for pack_name, queries in query_packs.items():
        for query in queries:
            try:
                results = search_provider.search(query, language="en")
            except Exception as e:
                if errors is None:
                    raise
                errors.append(f"{type(search_provider).__name__} '{query}': {e}")
                continue
            for r in results:
                cid = _candidate_id(r.url, r.title)
                if found is not None:
                    found.add(cid)
                if cid in seen or session.get(Candidate, cid):
                    continue
                seen.add(cid)
                candidate = Candidate(
                    candidate_id=cid, discovered_at=datetime.utcnow(),
                    source_id=source_id, source_url=r.url, title=r.title, description=r.snippet,
                    country=r.country, publication_date=_parse_date(r.published_date),
                    discovery_query=query, potential_categories=[pack_name],
                    processed=False,
                )
                session.add(candidate)
                new_candidates.append(candidate)
    session.commit()
    return new_candidates


def build_query_combinations(pack: dict, max_combinations: Optional[int] = None):
    terms = pack.get("terms", [])
    modifiers = pack.get("combine_with", [])
    if not modifiers:
        return list(terms)
    combos = [f"{t} {m}" for t in terms for m in modifiers]
    return combos[:max_combinations] if max_combinations else combos


if __name__ == "__main__":
    print("This module is a library used by the daily workflow orchestrator.")
