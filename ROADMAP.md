# Roadmap — effiq

Living plan for **effiq**. Dates are targets, not promises.

## Now (v0.1.0) — shipped baseline

- [x] Project branded as **effiq**
- [x] Canonical multi-source matrix (AA + OpenRouter + Cursor)
- [x] Intelligence floor 40 + Efficiency Score + weight sliders
- [x] Eight usage profiles + workload-based cost estimates
- [x] Approximation pipeline for missing efforts
- [x] Compare, export, methodology, Node/VPS sync timer
- [x] Unit tests for core scoring/identity/estimation

## Next (v0.2.0) — public GitHub + Cloudflare Pages

Goal: secret-free runtime on Pages; sync in CI.

- [x] Switch Astro to static output for Cloudflare Pages (removed `@astrojs/node`)
- [x] Prerender and bundle `data/models-matrix.json` and `.csv` into static endpoints
- [x] GitHub Actions workflow: daily `npm run sync` → commit matrix → trigger Pages deploy
- [x] Document Pages env (zero secrets required) vs Actions secrets (`ARTIFICIAL_ANALYSIS_API_KEY`, `CURSOR_API_KEY`, etc.)
- [x] Disable/remove `POST /api/sync` on Pages (no process spawn needed)
- [x] Sanitize repo: use relative `data/` inputs in CI and sync script with local fallbacks

## Soon (v0.3.0) — more free evidence sources

Wire as adapters under `src/lib/sources/` with provenance; never silently
override AA measured task cost.

| Source | Feeds | Priority |
|--------|-------|----------|
| LMSYS Chatbot Arena Elo | Writing, General | P0 |
| Hugging Face official leaderboard API / OpenEvals parquet | Math/Science, Coding | P0 |
| Berkeley Function Calling Leaderboard | Agents | P1 |
| LiveCodeBench | Coding | P1 |
| SWE-bench Verified (published results) | Coding agents | P1 |
| HELM public results | Research / transparency | P2 |

Also:

- [ ] Per-profile evidence coverage UI (“direct vs estimated domain score”)
- [ ] Family variant view: low/medium/high/xhigh side-by-side cost vs gain
- [ ] Custom workload editor in the UI (tokens in/out/reasoning/cache/calls)

## Later (v0.4.0+) — product depth

- [ ] OpenCode / KiloCode registries (official JSON only)
- [ ] Optional WhatLLM / LLM Stats adapters only if terms allow; never as
      authority over AA/official prices
- [ ] Playwright smoke tests (profiles, floor slider, export)
- [ ] Pareto “frontier only” filter + shareable ranking URLs
- [ ] Dark/light polish + mobile ranking cards
- [ ] Optional R2/KV matrix store for large artifacts
- [ ] User-saved presets (export/import JSON) without accounts

## Non-goals (for now)

- Running our own private LLM evals at scale
- Scraping sites that disallow redistribution
- Replacing Artificial Analysis Intelligence Index with a home-grown composite
- Paywalled benchmark APIs as hard dependencies

## Success metrics

| Metric | Target |
|--------|--------|
| Sync succeeds in CI daily | ≥ 95% of days |
| Matrix freshness | ≤ 36 hours on public deploy |
| Default view (intel ≥ 40) | Useful shortlist, not empty |
| Secrets in client bundle | Zero |
| Public docs completeness | README + ROADMAP + DATA_SOURCES + DEPLOYMENT |

## Decision log (short)

- **2026-09-05:** Project name **effiq** (efficiency × IQ); first public version
  tagged **v0.1.0**.
- **2026-09-05:** Default floor 40; efficiency-first weights; AA task cost
  preferred over token-price-only ranking.
- **2026-09-05:** Cloudflare Pages chosen for public hosting → requires adapter
  + CI sync; current Node SSR remains the local/VPS path.
