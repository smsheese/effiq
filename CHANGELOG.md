# Changelog

All notable changes to **effiq** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- 100% static output build support (`output: 'static'`) for zero-backend Cloudflare Pages hosting.
- Scheduled GitHub Actions sync workflow (`.github/workflows/sync.yml`) running daily at 04:00 UTC with automatic commit and push to trigger Cloudflare Pages deploys.
- Repo-relative fallback resolution in `scripts/sync.ts` with bundled `data/aa-catalog.json` and `data/cursor-models.csv`.
- Static build prerendering for `/api/models.json`, `/api/models.csv`, and `/api/health`.

### Changed

- Removed `@astrojs/node` SSR adapter in favor of pure static pre-rendering and client-side ranking.
- Updated `README.md`, `ROADMAP.md`, `docs/DEPLOYMENT.md`, and `.env.example` with Cloudflare Pages instructions.

### Removed

- Deleted `src/pages/api/sync.ts` (replaced by CI/cron sync workflow; no server-side child process spawning on Pages).

### Planned

- Free secondary benchmarks: Arena Elo, OpenEvals/HF leaderboards, BFCL
- Playwright smoke tests and fuller Vitest coverage

## [0.1.0] - 2026-09-05

First public release of **effiq** (efficiency × IQ).

### Added

- Token-efficiency-first product: Intelligence floor (default **40**), Efficiency
  Score, capability-per-dollar, measured vs estimated task cost.
- Eight usage profiles (General, Coding, Agents, Math & Science, Finance,
  Research, Writing & Literature, Multimodal) with domain weights and workload
  templates.
- Six ranking weight sliders + presets; URL query + `localStorage` persistence.
- Canonical schema and multi-source sync (`npm run sync`) merging:
  - Artificial Analysis catalog
  - OpenRouter provider catalog / perf
  - Cursor models CSV
- Hierarchical estimator for missing reasoning/thinking variants
  (interpolate → extrapolate → family estimate → insufficient).
- Explorer UI: hero leaders, profile tabs, expand/compare, Pareto scatters,
  CSV/JSON export, evidence badges.
- `/methodology` page.
- APIs: `/api/models.json` (matrix), `/api/models.csv`, `/api/health`,
  protected `/api/sync`.
- Deploy assets: nginx unit, app systemd unit, daily sync timer under `deploy/`.
- Vitest suite for identity, profiles, estimation, scoring.
- Docs: README, ROADMAP, CONTRIBUTING, DATA_SOURCES, DEPLOYMENT, `.env.example`.

### Notes

- Earlier private prototypes lived as an OpenRouter HTML/Astro explorer
  (`openrouter-models.html`, cache-based catalog). That lineage is folded into
  **effiq v0.1.0** rather than versioned as 0.2/0.3 publicly.

### Security

- Sync API requires `SYNC_TOKEN`. Secrets belong in `.env` / CI secrets, never
  the public client bundle.
