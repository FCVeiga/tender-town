# Tender Town — Setup Checklist

> Tender Town (formerly EUDI Radar) covers public procurement worldwide. The
> sections below that mention a single region or EUDI-specific config are optional.

Everything below is either already in the repo (needs real values) or
needs to be created as an environment/secrets file. Nothing here is
optional if you want the full product, worldwide, including the social layer.

---

## 1. Company profile (blocks fit-scoring)

**`config/company_profile.yaml`**
Still a template. Needs: certifications, product/tech stack, existing
references (country/sector/scale), team strengths, named partners.
Nothing downstream can compute a real "fit" score without this.

---

## 2. Accounts to track (News page — social)

**`config/tracked_accounts.yaml`**
Currently two example rows marked `active: false`. Needs: real LinkedIn
profile/company URLs and Twitter/X handles, categorised (Regulator,
Competitor, Partner, Standards Body, Journalist, Programme).

Decide LinkedIn approach first — this determines what else you need:
- **Option A (scraping provider)**: sign up for Apify or PhantomBuster,
  pick a LinkedIn posts-scraping actor, get an API token. Ongoing ToS
  risk to the account used.
- **Option B (official API)**: apply for LinkedIn's Community Management
  API partnership — slower, more restrictive (generally only covers
  pages you administer, not third parties).

---

## 3. API keys / secrets (environment variables, not committed to git)

Create a `.env` file locally and the equivalent secrets in GitHub Actions
+ Vercel/hosting once deployed. **Never commit this file.**

| Variable | Where to get it | Used by |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com | All LLM calls — triage, requirement extraction, digest generation |
| `SEARCH_API_KEY` | serper.dev or tavily.com | General web search (adapters/web_search.py real implementation) |
| `TWITTER_BEARER_TOKEN` | developer.twitter.com/en/portal/dashboard (Basic tier+ for read access) | adapters/twitter.py |
| `APIFY_API_TOKEN` | apify.com | adapters/linkedin.py (if going with Option A above) |
| `DATABASE_URL` | Your Postgres/Supabase connection string | database/models.py get_engine() |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | supabase.com project settings | Dashboard backend + DB access |

---

## 4. Source registry — fill in the nulls

**`config/countries.yaml`** — 30 of 32 countries now have a confirmed
real national procurement portal (only Germany — genuinely fragmented,
no single portal exists — and Liechtenstein — no separate portal, uses
SIMAP/TED — remain without one, both documented with why). Primary
source: the European Commission's own official "Public procurement in
EU countries" page, cross-checked against independent confirmation for
several.

**Important finding: no new API keys or logins were needed for any of
this.** Every source found this round is a public government website or,
for six countries, a genuinely free structured API/open-data feed:

| Country | Source | License |
|---|---|---|
| Italy | ANAC OCDS feed | CC BY 4.0 |
| Netherlands | TenderNed open data | CC0 |
| France | BOAMP open data | Open (data.gouv.fr) |
| UK | Find a Tender OCDS API | Open Government Licence v3.0 |
| Denmark | udbud.dk's own JSON search API | Public, no key |
| (already had) | TED, World Bank | Open |

That's 8 free structured APIs now catalogued in `config/sources.yaml` —
worth prioritizing these over generic web scraping for those countries.

A few entries carry a caveat worth reading before relying on them:
- **Sweden**: linked site is the policy/advisory agency, not one
  transactional portal — notices are spread across several commercial
  e-procurement systems.
- **Poland**: UZP is the right authority, but the transactional
  e-Zamówienia platform's build-out has had a troubled history (a
  cancelled 2019 contract) — verify the current live URL before wiring in.
- **Finland**: two candidate URLs found (hankinnat.fi vs
  hankintailmoitukset.fi) — confirm which is the actual notice portal.
- **Greece**: eaadhsy.gr is the central authority; promitheus.gov.gr may
  be the actual transactional system — check both.

**`config/sources.yaml`** — now includes all 8 confirmed free/keyless
structured sources above. A handful of tier-2 entries (EUDI Launchpad,
ECCC) remain `null` — low priority.

**`config/sources_africa_latam.yaml`** — unchanged this round. World
Bank confirmed keyless; IDB has open datasets but no confirmed live API;
AfDB has no API at all — portal/eSourcing only.

---

## 5. Adapter-specific config

**`adapters/ted.py`**
`_TED_API_BASE` and the query param names (`scope`, etc.) are based on
TED's documented API shape but haven't been tested live — verify against
current TED API docs before relying on it (endpoints/params do drift).

**`adapters/linkedin.py`**
`actor_id = "REPLACE_WITH_APIFY_LINKEDIN_ACTOR_ID"` — pick a specific
actor from the Apify Store and drop its ID in here (or wherever you
instantiate the adapter).

---

## 6. Infrastructure accounts (not files, but blocking)

- [ ] GitHub repo (to host the code + run the daily Action)
- [ ] Supabase project (Postgres + pgvector, free tier is enough to start)
- [ ] Vercel project (for the Next.js dashboard, once built)
- [ ] Serper or Tavily account (search)
- [ ] Anthropic API account (LLM calls)
- [ ] Twitter/X Developer account, Basic tier or above
- [ ] Apify or PhantomBuster account (if doing LinkedIn monitoring)

---

## Suggested order of operations

1. Send Biometrid's company profile (unblocks fit scoring everywhere)
2. Decide the LinkedIn approach (Option A vs B above)
3. Create the accounts in section 6
4. Fill in `.env` secrets (section 3)
5. Do a first manual pass on `config/countries.yaml` for your top 5-10
   priority countries — don't wait for full automation to start
6. Populate `config/tracked_accounts.yaml` with real accounts
7. Then we wire it all together and run the first live daily pass
