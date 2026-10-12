"""
Settings page → pipeline. Read once at the start of a run (load()).

Scopes (migration 025): each scope has a name, instructions, a search
configuration and its own agents — Search, Triage, Tender Evaluation,
Proposal Manager, News Report. The pipeline runs every scope that is active
(or the default scope): it searches and triages per scope. These agents are
configured per scope in scope_agent_settings.

Platform agents work on the shared data for all scopes — Tender Documents,
Tender Analysis, Feed Writer, Translator — and are configured once in
agent_settings (switch, fine-tuned prompt). The Verification Agent is
internal and always runs.

load() also copies every agent's default prompt into agent_settings, so the
Settings page can show it ("Open config") without access to the repo.
Without database rows, everything falls back to the built-in defaults.
"""
import json
import os
import re
from types import SimpleNamespace

from sqlalchemy import text

_ROOT = os.path.join(os.path.dirname(__file__), "..")
# Agent key -> its prompt file (repo-relative). Keys match webapp/lib/agents.ts.
AGENT_PROMPTS = {
    "triage": "prompts/triage.md",
    "tender_analysis": "prompts/tender_requirements.md",
    "feed_writer": "prompts/feed_post.md",
    "translator": "prompts/translation.md",
    "tender_evaluation": "webapp/agents/tender_evaluation.md",
    "news_report": "webapp/agents/news_report.md",
    "proposal_manager": "webapp/agents/proposal_manager.md",
}
SCOPE_AGENTS = ["search", "triage", "tender_evaluation", "proposal_manager", "news_report"]
PLATFORM_AGENTS = ["tender_documents", "tender_analysis", "feed_writer", "translator"]
ALL_AGENTS = SCOPE_AGENTS + PLATFORM_AGENTS
DEFAULT_SCOPE_NAME = "General"
# Agent updates per day by plan (keep in sync with webapp/lib/plans.ts); scopes per workspace.
RUNS_PER_DAY = {"free": 1, "starter": 2, "pro": 3, "teams": 6}
SCOPES_PER_PLAN = {"free": 0, "starter": 1, "pro": 5, "teams": 1000}

_state = {"loaded": False, "enabled": {}, "overrides": {}, "scopes": [], "default": None}


def builtin_rules() -> dict:
    """The Triage Agent's built-in relevance and importance rules (between the markers in prompts/triage.md)."""
    triage = open(os.path.join(_ROOT, AGENT_PROMPTS["triage"])).read()
    grab = lambda m: (re.search(rf"<!-- {m} -->(.*?)<!-- /{m} -->", triage, re.S) or [None, ""])[1].strip()
    return {"relevance_rubric": grab("scope"), "importance_rubric": grab("importance")}


def load(session, search_defaults: dict = None) -> None:
    """Read the settings and scopes, and sync the default prompts — and, for the
    Search Agent, the built-in search configuration (search_defaults), shown and
    editable on Settings. Safe to call when the tables don't exist yet."""
    try:
        for key in ALL_AGENTS:
            path = AGENT_PROMPTS.get(key)
            default = open(os.path.join(_ROOT, path)).read() if path else None
            if key == "tender_documents":
                from agents.tender_documents import DEFAULT_CONFIG
                default = json.dumps(DEFAULT_CONFIG, ensure_ascii=False, indent=2)
            if key == "search" and search_defaults:
                default = json.dumps({**search_defaults, **builtin_rules()}, ensure_ascii=False, indent=2)
            session.execute(text("""insert into agent_settings (agent_key, default_prompt) values (:k, :p)
                    on conflict (agent_key) do update set default_prompt = coalesce(excluded.default_prompt, agent_settings.default_prompt)"""), {"k": key, "p": default})
        session.commit()
        rows = session.execute(text("select agent_key, enabled, prompt_override from agent_settings")).fetchall()
        _state["enabled"] = {r.agent_key: bool(r.enabled) for r in rows if r.agent_key in PLATFORM_AGENTS}
        _state["overrides"] = {r.agent_key: r.prompt_override for r in rows if r.prompt_override and r.agent_key in PLATFORM_AGENTS + ["translator"]}

        scopes = session.execute(text("""select s.id, s.name, s.instructions, s.active, s.is_default, s.catalog, s.search_config, s.last_run_at,
                   s.workspace_id, a.plan,
                   row_number() over (partition by s.workspace_id order by s.created_at) as rank
            from scopes s left join workspaces w on w.id = s.workspace_id
            left join accounts a on a.owner_id = w.owner_id and a.kind = 'personal'
            order by s.is_default desc, s.created_at""")).fetchall()
        # The default scope is the default whether or not it runs now (prompt and config fallbacks).
        default_row = next((s for s in scopes if s.is_default), None)
        scopes = [s for s in scopes if _due(s)]
        agents = session.execute(text("select scope_id, agent_key, enabled, prompt_override from scope_agent_settings")).fetchall()
        _state["scopes"] = []
        for s in scopes:
            mine = [a for a in agents if a.scope_id == s.id]
            _state["scopes"].append(SimpleNamespace(
                id=str(s.id), name=s.name, instructions=s.instructions, is_default=s.is_default,
                search=s.search_config or {},
                enabled={a.agent_key: bool(a.enabled) for a in mine},
                overrides={a.agent_key: a.prompt_override for a in mine if a.prompt_override},
            ))
        _state["default"] = next((s for s in _state["scopes"] if s.is_default), None)
        if _state["default"] is None and default_row is not None:
            mine = [a for a in agents if a.scope_id == default_row.id]
            _state["default"] = SimpleNamespace(
                id=str(default_row.id), name=default_row.name, instructions=default_row.instructions, is_default=True,
                search=default_row.search_config or {},
                enabled={a.agent_key: bool(a.enabled) for a in mine},
                overrides={a.agent_key: a.prompt_override for a in mine if a.prompt_override})
        if _state["default"] is None and _state["scopes"]:
            _state["default"] = _state["scopes"][0]
    except Exception as e:  # missing tables (migrations 015 / 025 not applied): run on defaults
        session.rollback()
        print(f"Settings: using defaults ({str(e)[:120]})")
    _state["loaded"] = True


def _due(s) -> bool:
    """Does this scope run now? Active, covered by its workspace owner's plan, and due
    by the plan's cadence. The default scope and the shared catalog scopes run once
    a day, whatever plan a workspace is on. FORCE_ALL_SCOPES=1 runs every eligible
    scope regardless of cadence."""
    from datetime import datetime, timezone
    if s.is_default or s.catalog:
        if s.catalog and not s.active:
            return False
        runs = 1
    else:
        if not s.active:
            return False
        plan = s.plan or "free"  # the workspace owner's plan
        if s.rank > SCOPES_PER_PLAN.get(plan, 0):
            return False  # beyond the plan's scopes (e.g. after a downgrade), or Free
        runs = RUNS_PER_DAY.get(plan, 1)
    if os.environ.get("FORCE_ALL_SCOPES") == "1" or s.last_run_at is None:
        return True
    hours = (datetime.now(timezone.utc) - s.last_run_at).total_seconds() / 3600
    return hours >= 24 / runs - 0.5


def mark_ran(session, scope) -> None:
    """Record that a scope's search and triage finished (its plan's cadence counts from here)."""
    session.execute(text("""update scopes set last_run_at = now(), last_success_at = now(),
        last_attempt_at = now(), last_run_error = null where id = cast(:i as uuid)"""), {"i": scope.id})
    session.commit()


def mark_failed(session, scope, error: str) -> None:
    """The latest collection did not finish. An earlier success, if any, stays in place."""
    session.execute(text("""update scopes set last_attempt_at = now(), last_run_error = :e
        where id = cast(:i as uuid)"""), {"i": scope.id, "e": (error or "Collection failed")[:300]})
    session.commit()


def scopes():
    """The scopes this run works for (active ones, plus the default scope)."""
    return _state["scopes"]


def default_scope():
    return _state["default"]


def enabled(agent_key: str, scope=None) -> bool:
    """Platform agent switch, or — with a scope — that scope's agent switch."""
    if scope is not None:
        return scope.enabled.get(agent_key, True)
    return _state["enabled"].get(agent_key, True)


def agent_config(agent_key: str):
    """A platform agent's saved configuration from Settings (a prompt, or JSON for the Tender Documents Agent), or None."""
    return _state["overrides"].get(agent_key)


_TARGET = re.compile(r"^Target language:\s*(.+?)\s*\(([a-z]{2,3})\)\s*$", re.M | re.I)


def target_language() -> tuple:
    """The platform language, from the Translator Agent's config line
    "Target language: English (en)" → ("English", "en"). Every text the
    platform shows is written or translated into it."""
    prompt = _state["overrides"].get("translator") or open(os.path.join(_ROOT, AGENT_PROMPTS["translator"])).read()
    m = _TARGET.search(prompt)
    return (m.group(1).strip(), m.group(2).lower()) if m else ("English", "en")


def company_name(scope=None) -> str:
    s = scope or default_scope()
    return (s.name if s else None) or DEFAULT_SCOPE_NAME


def search_config(scope=None) -> dict:
    """A scope's parsed search configuration (default scope if none given), or {} for the built-in EUDI defaults."""
    s = scope or default_scope()
    return (s.search if s else None) or {}


def prompt_for(prompt_filename: str, default: str, scope=None) -> str:
    """The agent's prompt: the scope's fine-tuned version for scope agents (or
    the platform's for platform agents), with the scope's relevance rules,
    topic, name and the platform language filled in."""
    key = next((k for k, p in AGENT_PROMPTS.items() if p.endswith("/" + prompt_filename)), None)
    s = scope or default_scope()
    if key in SCOPE_AGENTS:
        prompt = (s.overrides.get(key) if s else None) or default
    else:
        prompt = _state["overrides"].get(key) or default
    cfg = search_config(s)
    if cfg.get("mode") == "generic":
        # No industry: platform agents (feed posts, …) write for a general audience.
        cfg = {"topic": "public tenders and public-sector news across all sectors"}
    for marker, field in (("scope", "relevance_rubric"), ("importance", "importance_rubric")):
        if cfg.get(field):
            prompt = re.sub(rf"<!-- {marker} -->.*?<!-- /{marker} -->",
                            lambda _m: f"<!-- {marker} -->\n{cfg[field].strip()}\n<!-- /{marker} -->", prompt, flags=re.S)
    if cfg.get("topic"):
        prompt = prompt.replace("{topic}", cfg["topic"])
    if key == "triage" and s and (s.instructions or "").strip():
        # The scope's instructions (who it is for, what they sell, what they go
        # for and what they don't) sharpen relevance beyond the search rubric.
        prompt = prompt.replace("<!-- /scope -->", "<!-- /scope -->\n\n## Scope instructions (from the scope's admins)\n"
                                "Use these to judge relevance and importance for this scope. Where they say what is "
                                "out of scope, score it below 50.\n\n" + s.instructions.strip()[:6000] + "\n", 1)
    return (prompt.replace("{topic}", "EUDI Wallet").replace("{company_name}", company_name(s))
            .replace("{language}", target_language()[0]))
