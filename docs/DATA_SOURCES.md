# Data sources — effiq

How **effiq** ingests model evidence, what auth each source needs, and how to enable it.

## Active sources (v0.2.0)

| Source | Adapter | Auth | Enable |
|--------|---------|------|--------|
| **Artificial Analysis** | `src/lib/sources/artificial-analysis.ts` | Bundled `data/aa-catalog.json`, or local `AA_CATALOG_PATH`, or `ARTIFICIAL_ANALYSIS_API_KEY` for live refresh (when wired) | `data/aa-catalog.json` (bundled) or `AA_CATALOG_PATH`; run `npm run sync` |
| **OpenRouter** | `src/lib/sources/openrouter.ts` | None for public `models/find` | Cache via `OPENROUTER_CACHE`; set `OPENROUTER_REFRESH=1` to refetch |
| **Cursor** | `src/lib/sources/cursor.ts` | Bundled `data/cursor-models.csv`, or `CURSOR_MODELS_CSV` export; `CURSOR_API_KEY` only to regenerate CSV offline | `data/cursor-models.csv` (bundled) or `CURSOR_MODELS_CSV`; refreshed by `npm run sync:agent` |
| **CursorBench** | `src/lib/sources/cursor.ts` | Bundled `data/cursorbench.json` from [CursorBench](https://cursor.com/cursorbench) | Manual snapshot per official release (page is JS-rendered; not agent-safe) |
| **OpenCode Go** | `src/lib/sources/opencode-go.ts` | Bundled `data/opencode-go.json` from [OpenCode Go](https://opencode.ai/docs/go/) | `data/opencode-go.json` (bundled) or `OPENCODE_GO_JSON`; refreshed by `npm run sync:agent` |
| **Claude subscriptions** | `src/lib/sources/subscriptions.ts` | Manual `data/subscription-plans.json` snapshot from [Claude pricing](https://claude.com/pricing) (Pro $20, Max 5x $100, Max 20x $200) | Bundled seed or `SUBSCRIPTION_PLANS_JSON`; opt-in refresh `--only claude_sub` |
| **ChatGPT subscriptions** | `src/lib/sources/subscriptions.ts` | Manual `data/subscription-plans.json` snapshot from [ChatGPT pricing](https://openai.com/chatgpt/pricing/) (Plus $20, Pro $200, Business ~$25/seat) | Bundled seed or `SUBSCRIPTION_PLANS_JSON`; auto-refresh disabled (prices render client-side — same confabulation guard as CursorBench) |
| **Cursor subscriptions** | `src/lib/sources/subscriptions.ts` | Manual `data/subscription-plans.json` snapshot from [Cursor models & pricing](https://cursor.com/docs/models-and-pricing) (Pro $20, Pro Plus $60, Ultra $200, Teams Standard $40/seat, Premium $120/seat) | Bundled seed or `SUBSCRIPTION_PLANS_JSON` |
| **Metered budgets** | `src/lib/sources/subscriptions.ts` | Derived comparison tiers in the same seed: OpenRouter $20/$50/$100 pay-as-you-go budgets, OpenCode Go $20/$50/$100 ($10 membership + Zen credits) | Same seed; burn priced from measured tariffs (Zen offer tariffs via `tariffChannel`) |

Website-sourced seeds (Cursor pricing, OpenCode Go) have no API. The Cursor
docs site dropped its machine-readable `.md` endpoint (404 since 2026-09-08),
so `scripts/agent_refresh.py` (`npm run sync:agent`) fetches the HTML docs
page for Cursor (`cursor.com/docs/models-and-pricing`) and the markdown
endpoint for OpenCode Go (`opencode.ai/docs/go.md`) and extracts rows with an
OpenRouter chat model (temperature 0, JSON-only) into the
seed files. Merges are update-only: prices update in place, new models
appended, nothing deleted. Guards: a minimum-row count rejects partial
extractions, and fast-mode CSV rows only ever take prices from explicit
`(Fast)` docs entries (never inherited standard prices); `--dry-run` previews
changes. CursorBench is excluded by design (JS-rendered results page, values
only in chart SVG coordinates — automated extraction confabulates rows), so
`data/cursorbench.json` remains a manual snapshot per release. The refresh
runs best-effort at the start of the daily sync workflow and skips cleanly when
`OPENROUTER_API_KEY` is unset, so the matrix build always falls back to the
bundled seeds. Pin the model with `REFRESH_MODEL` (default
`openai/gpt-5.6-luna`) and the reasoning effort with
`REFRESH_REASONING_EFFORT` (default `high`).
The older regex-only `scripts/cursor_pricing_pyagent.py` (`npm run sync:cursor`)
remains as a keyless fallback for Cursor pricing.

Outputs of sync:

- `data/models-matrix.json` / `.csv`
- `data/sync-manifest.json`
- `data/snapshots/` (gitignored)

Manual crosswalk seeds: `data/crosswalks.json`.

Bundled input seeds: `data/aa-catalog.json`, `data/cursor-models.csv`, `data/cursorbench.json`, `data/opencode-go.json`, `data/subscription-plans.json`.

Subscription plans are flat fees, not per-token offers, so they validate
through `parseSubscriptionCatalog` (unknown ids, bucket drift, bad capacity
ranges, and empty model families fail the sync) and surface on
`/subscriptions/` — never merged into Effiq Score variants. Each plan carries
`modelFamilies` (matrix slugs, smartest first), an optional `burnFamilies`
range for Cursor pool math, and a `capacity` object in the plan's native unit:
Claude in weekly Sonnet-equiv hours (Pro 40–80, Max 5x 140–280 + 15–35 Opus,
Max 20x derived 4× — all from Anthropic announcements), Cursor in monthly
API-dollar pools (included value ≈ fee, community consensus; mechanism
official), ChatGPT in Codex messages per 5h session (Plus Sol 10–100 through
Pro 20x 200–2000, official Codex pricing). Capacity basis is labeled
`official` / `community` / `derived` throughout. `src/lib/subscriptionAdvisor.ts`
holds the pure fit logic (task sizes from workload templates, verdicts,
ranking) with unit tests; the page embeds its output as JSON and mirrors the
arithmetic in an inline script. ChatGPT Pro now has two tiers (Pro 100 at $100
= 5x Plus, Pro 200 at $200 = 20x Plus, per the official help center — no annual
billing on Plus/Pro). No Anthropic/OpenAI API key would add firmer data.

## Stubbed / not enabled

| Source | Status | Notes |
|--------|--------|-------|
| KiloCode | Skipped | Need public registry URL |
| WhatLLM | Skipped | Aggregator; terms/robots; do not override AA |
| LLM Stats | Skipped | Same |

## Planned free sources (see ROADMAP)

- LMSYS Chatbot Arena Elo
- Hugging Face official leaderboard API / OpenEvals parquet
- BFCL, LiveCodeBench, SWE-bench Verified, HELM

Rules:

1. Preserve provenance (`source`, `observedAt`, `status`, confidence).
2. Never silently replace AA **measured** task cost with a scrape.
3. Label interpolations / family estimates in the UI.

## Public GitHub

Safe to commit: matrix JSON/CSV, crosswalks, docs.  
Never commit: `.env`, API keys, private dumps you do not want public.
