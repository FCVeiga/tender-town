"""
Translator Agent — everything the platform shows, in the platform language
(the "Target language" line of its config, prompts/translation.md; English
by default).

Search, documents and triage work on the original languages. Once an item
is on the platform — a tender, a news story, a tender document, a live
activity entry — this translates its title, buyer name, document name and
short summary, and writes the notes for tender updates, in small batches
each run. Each translated column records its language (the row's `lang`
map), so after a language change everything out of date is redone. The
website shows only text in the platform language (webapp/lib/english.ts).
(The column names still say _en: they hold the platform-language text.)
"""
import os
import sys

from sqlalchemy import text

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from services.llm_client import call_llm_json, load_prompt, CHEAP_MODEL  # noqa: E402
from services.agent_settings import target_language  # noqa: E402

BATCH = 20
MAX_BATCHES_PER_RUN = 2  # a backlog drains over later runs; one run does not translate the queue

# The translation prompt lives in prompts/translation.md (fine-tunable on Settings).


# (table, key, source column, target column, kind, extra condition) — every
# text the site shows that isn't written by an agent in the platform language.
# Site-search finds only matter once triage marked them relevant. Summaries
# translate in place (source = target): triage writes them, in the platform
# language at the time.
TARGETS = [
    ("opportunities", "opportunity_id", "title", "title_en", "title", ""),
    ("opportunities", "opportunity_id", "authority", "authority_en", "name", ""),
    ("opportunities", "opportunity_id", "summary", "summary", "text", ""),
    ("news_items", "news_id", "title", "title_en", "title", ""),
    ("news_items", "news_id", "summary", "summary", "text", ""),
    ("documents", "document_id", "name", "name_en", "title", ""),
    ("source_activity", "id", "title", "title_en", "title",
     "and (relevant is true or source_id in (select source_id from sources where method <> 'site_search'))"),
]


def translate(texts: list, kind: str) -> list:
    listing = "\n".join(f'{i + 1}. [{kind}] {t}' for i, t in enumerate(texts))
    out = call_llm_json(load_prompt("translation.md"), listing, model=CHEAP_MODEL, max_tokens=4000)
    by_n = {int(x["n"]): x for x in out.get("items", []) if "n" in x}
    return [by_n.get(i + 1, {}) for i in range(len(texts))]


def backfill_english_titles(session, errors: list) -> int:
    """Fill every platform-language column the site reads from (see TARGETS),
    a few batches per run, until nothing is missing or in another language.
    On an API failure it stops and retries next run; the site never shows
    text in another language meanwhile."""
    done, batches = 0, 0
    lang = target_language()[1]
    for table, key, src, dst, kind, extra in TARGETS:
        has_lang = table != "source_activity" and src == "title"
        in_place = src == dst
        while batches < MAX_BATCHES_PER_RUN:
            missing = "false" if in_place else f"{dst} is null"
            rows = session.execute(text(f"select {key} as k, {src} as src from {table} "
                                        f"where ({missing} or coalesce(lang->>'{dst}', '') <> :lang) and {src} is not null {extra} "
                                        f"order by {key} limit {BATCH}"), {"lang": lang}).fetchall()
            if not rows:
                break
            batches += 1
            try:
                results = translate([r.src for r in rows], kind)
            except Exception as e:
                errors.append(f"translate {table}.{src}: {e}"[:300])
                return done
            for r, res in zip(rows, results):
                out = (res.get("text") or "").strip() or r.src
                sets = f"{dst} = :t, lang = lang || jsonb_build_object('{dst}', cast(:target as text))" \
                    + (", language = coalesce(language, :l)" if has_lang else "")
                session.execute(text(f"update {table} set {sets} where {key} = :k"),
                                {"t": out[:4000 if in_place else 500], "target": lang, "l": (res.get("language") or None), "k": r.k})
                done += 1
            session.commit()
    return done


_NOTE_SYSTEM = """You write update notes on public tenders for bid managers, posted as a
short comment under the tender. You get, for each numbered update, the change
the radar detected and what the official change notice says (often in the
buyer's language). Write one note per update in {language}, max 200 characters: lead with
the change, then the reason if given; mention clarifications, amended
documents, price sheets or contract clauses when the notice says so. Plain
and factual, no filler. Dates as "5 Oct 2026".

Reply with JSON only: {"items": [{"n": 1, "note": "..."}, ...]}"""


def write_update_notes(session, errors: list) -> int:
    """Notes, in the platform language, for change events whose notice text hasn't
    been turned into one yet (or whose note is in another language)."""
    name, lang = target_language()
    rows = session.execute(text("""select id, description, note_source from change_events
        where (note is null or coalesce(lang->>'note', '') <> :lang) and note_source is not null order by id limit 40"""),
                           {"lang": lang}).fetchall()
    if not rows:
        return 0
    listing = "\n".join(f"{i + 1}. Detected: {r.description}\n   Notice says: {r.note_source[:1200]}" for i, r in enumerate(rows))
    try:
        out = call_llm_json(_NOTE_SYSTEM.replace("{language}", name), listing, model=CHEAP_MODEL, max_tokens=4000)
    except Exception as e:
        errors.append(f"update notes: {e}"[:300])
        return 0
    by_n = {int(x["n"]): x.get("note") for x in out.get("items", []) if "n" in x}
    done = 0
    for i, r in enumerate(rows):
        if by_n.get(i + 1):
            session.execute(text("update change_events set note = :n, lang = lang || jsonb_build_object('note', cast(:l as text)) where id = :id"),
                            {"n": by_n[i + 1][:300], "l": lang, "id": r.id})
            done += 1
    session.commit()
    return done

