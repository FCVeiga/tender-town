# Tender Town — instructions for coding agents

Tender Town (formerly EUDI Radar) is a platform for public tenders, funding and
market news worldwide, with a community (posts, comments, chat, profiles).
Read `README.md` for the product and architecture, `webapp/README.md` for the
web app, `MIGRATION.md` for accounts and deployment.

## Stack

- **Pipeline**: Python 3.11, SQLAlchemy, `run_daily.py` (GitHub Actions, every 4 h).
  Agents in `agents/`, prompts in `prompts/`, scope/agent settings in `services/agent_settings.py`.
- **Web app**: Next.js 14 App Router in `webapp/` (server components + server actions), Supabase
  (Postgres, auth via `@supabase/ssr` with the service key — server-side only, storage), Stripe.
- **Database**: Supabase Postgres. Schema changes are numbered files in `database/migrations/NNN_name.sql`
  (next: 032). Keep them idempotent (`if not exists`); apply them to the live DB and commit them.

## Domain model

- **Scope**: one configuration of the radar — instructions, context documents, search config
  (`search_config` JSON), followed sources (`scope_sources`), agent settings. `is_default` marks
  **General**, the scope visitors and new users see. General has `search_config.mode = "generic"`:
  no LLM; tenders and news are scored in `agents/generic_scope.py`.
- **Workspace**: holds scopes and members (admin/member). `profiles.current_workspace_id` is the
  active one; it decides what Home, Tenders, News, History and Community show.
- **Plans** (`webapp/lib/plans.ts`, mirrored in `services/agent_settings.py`): Free, Starter, Pro, Teams;
  a workspace's limits come from its owner's personal plan.
- Results per scope live in `scope_items` (item_type tender|news, relevance).

## Rules learned the hard way

- Never print secrets (`.env`, keys, connection strings). Load env with `set -a && source .env && set +a`.
- Before writing to the live database, check what a statement will touch; run data changes in a
  transaction with assertions on the expected counts; select scopes **by name or id**, never through
  a "current/default" helper (one such fallback once pointed at the wrong scope and deleted its news).
- `services.agent_settings.default_scope()` must stay the `is_default` scope even when it isn't due.
- The Anthropic key must be workspace-scoped (or set `ANTHROPIC_WORKSPACE_ID`). Check credit with a
  1-token call before assuming LLM steps work; the site degrades gracefully without it.
- The direct Supabase DB host is IPv6-only: use the Session pooler URL in CI.
- `'use server'` files export callable actions — keep helpers in `lib/` (`server-only`).

## UI conventions

- **Copy is minimal**: a title and the controls. No explanatory paragraphs, no "saved as you switch"
  lines; one short hint only when an action is destructive or non-obvious. Secondary forms open from a
  button (modal), not always visible.
- **Look**: flat, Reddit-like — white page (dark mode supported), sections split by hairlines, rows with
  hover fill, light-grey fill for side panels; no boxed cards on grey.
- **Settings** pattern: rows with the current value and a › that opens a modal; toggles for on/off.
- **Every visible string goes through `t()`**: `useT()` in client components, `await getT()` /
  `getTSync()` on the server; keys are the English text; add translations (pt, es, fr, de, it) to a
  dictionary in `webapp/lib/i18n/messages/*.json`. Dates use `useLocale()` / `getLocale()`.
- Colours only via the tokens in `webapp/app/globals.css` (dark mode redefines them).
- Mobile matters: check phone width; dialogs become bottom sheets.

## Working

- Type-check and build before committing: `cd webapp && npx tsc --noEmit && npx next build`.
- Verify UI changes in a browser (light and dark, desktop and phone width) before calling them done.
- Commit to `main`; pushes deploy to Vercel. Production: https://tendertown.io.
