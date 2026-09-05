# Data sources — effiq

How **effiq** ingests model evidence, what auth each source needs, and how to enable it.

## Active sources (v0.1.0)

| Source | Adapter | Auth | Enable |
|--------|---------|------|--------|
| **Artificial Analysis** | `src/lib/sources/artificial-analysis.ts` | Bundled `data/aa-catalog.json`, or local `AA_CATALOG_PATH`, or `ARTIFICIAL_ANALYSIS_API_KEY` for live refresh (when wired) | `data/aa-catalog.json` (bundled) or `AA_CATALOG_PATH`; run `npm run sync` |
| **OpenRouter** | `src/lib/sources/openrouter.ts` | None for public `models/find` | Cache via `OPENROUTER_CACHE`; set `OPENROUTER_REFRESH=1` to refetch |
| **Cursor** | `src/lib/sources/cursor.ts` | Bundled `data/cursor-models.csv`, or `CURSOR_MODELS_CSV` export; `CURSOR_API_KEY` only to regenerate CSV offline | `data/cursor-models.csv` (bundled) or `CURSOR_MODELS_CSV` |

Outputs of sync:

- `data/models-matrix.json` / `.csv`
- `data/sync-manifest.json`
- `data/snapshots/` (gitignored)

Manual crosswalk seeds: `data/crosswalks.json`.

Bundled input seeds: `data/aa-catalog.json`, `data/cursor-models.csv`.

## Stubbed / not enabled

| Source | Status | Notes |
|--------|--------|-------|
| OpenCode | Skipped | Need public registry URL |
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
