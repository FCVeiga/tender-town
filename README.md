# Tender Town

**Public tenders, funding and market news worldwide — and a community of
the people who bid on them.** Live at https://tendertown.io.

Tender Town is a platform for public procurement worldwide: tenders, grants
and funding calls, development-bank procurement, and the news around them,
with a social layer (posts, comments, chat, profiles) on top.

## What it does

- **Tenders** — open RFPs, RFIs, grants and procurement signals from
  procurement portals, funding programmes and development banks worldwide;
  each tender page has its documents, a summary and the full list of
  requirements, a fit evaluation and a proposal brief for your scope.
- **News** — regulation, industry and market stories, with an on-demand report
  on what they mean for you.
- **History** — every tender analysed, sortable by deadline, value, relevance.
- **Community** — a Reddit-style feed of posts, threaded comments, likes,
  follows, chat and notifications; profiles with Aura.
- **Workspaces & scopes** — a scope is one configuration of the radar (its
  instructions, context documents, search, followed sources and agents). A
  workspace holds scopes and team members; the active workspace decides what
  the whole site shows. New users and visitors see the **General** scope:
  the most significant tenders and news across all sectors.
- **Plans** — Free, Starter, Pro, Teams (Stripe-ready).
- **Settings** — account, profile, privacy, preferences (interface language:
  English, Português, Español, Français, Deutsch, Italiano; light/dark/auto),
  notifications.

## How it works

A pipeline (`run_daily.py`, GitHub Actions every 4 hours) runs each due scope:

1. **Search Agent** — TED, the web and news (Tavily), and the scope's followed
   sources (RSS feeds and site searches).
2. **Triage Agent** — scores every find against the scope's search rules and
   instructions (LLM). The **General** scope is generic: no LLM, it ranks by
   contract value, buyer standing, market breadth and time to bid for tenders,
   and by outlet reputation, coverage and freshness for news
   (`agents/generic_scope.py`).
3. **Tender Documents / Tender Analysis Agents** — collect notices and
   documents, write summaries and requirements.
4. **Feed Writer / Translator Agents** — write the feed posts and translate
   content into the platform language.

On-click agents in the web app: **Tender Evaluation**, **Proposal Manager**,
**News Report**. Agent prompts live in `prompts/` (pipeline) and
`webapp/agents/` (web app); each scope can fine-tune its agents in plain
language from its page.

## Repository layout

```
run_daily.py     pipeline orchestrator (discovery → triage → documents → analysis → feed)
agents/          pipeline agents (discovery, triage, generic_scope, source_monitor,
                 tender_documents, tender_analysis, feed_writer, translation, …)
adapters/        TED, Tavily, World Bank, … search adapters
services/        LLM client, agent settings (scopes, prompts), deduplication
prompts/         pipeline agent prompts
database/        SQLAlchemy models + Supabase migrations (database/migrations/NNN_*.sql)
config/          countries, languages, keywords, sources
webapp/          Next.js 14 app (App Router, Supabase, Stripe) — the site
.github/workflows/  daily.yml (the pipeline, every 4 hours)
```

## Running it

- **Database**: Supabase (Postgres). Apply `database/migrations/*.sql` in order.
- **Pipeline**: `pip install -r requirements.txt`, set the environment below,
  `python3 run_daily.py`. `FORCE_ALL_SCOPES=1` runs every scope regardless of
  its plan's cadence.
- **Web app**: see `webapp/README.md`; deployed on Vercel (root `webapp`).

Environment (pipeline): `DATABASE_URL`, `ANTHROPIC_API_KEY`
(+ `ANTHROPIC_WORKSPACE_ID` for unscoped keys), `TAVILY_API_KEY`; optional
`TAVILY_QUERIES_PER_RUN`, `MAX_TRIAGE_PER_RUN`.

Moving to new accounts or a new computer: `MIGRATION.md`. Instructions for coding agents: `AGENTS.md`.
Older notes on accounts and keys: `SETUP_CHECKLIST.md`, `API_KEYS_NEEDED.md`.
