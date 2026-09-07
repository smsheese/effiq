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

Website-sourced seeds (Cursor pricing, OpenCode Go) have no API, but both docs
sites serve machine-readable markdown at `.md` endpoints
(`cursor.com/docs/models-and-pricing.md`, `opencode.ai/docs/go.md`).
`scripts/agent_refresh.py` (`npm run sync:agent`) fetches that markdown and
extracts rows with an OpenRouter chat model (temperature 0, JSON-only) into the
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

Bundled input seeds: `data/aa-catalog.json`, `data/cursor-models.csv`, `data/cursorbench.json`, `data/opencode-go.json`.

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
