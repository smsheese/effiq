# Changelog

All notable changes to **effiq** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Header tagline names all three provider channels (OpenRouter, Cursor, and OpenCode Go).
- Data refresh: matrix re-synced on 2026-09-07 with 1184 variants (0 added, 0 removed). All live sources healthy — Artificial Analysis (643 rows), Cursor (363), OpenRouter (982), OpenCode Go (28).

## [0.2.0] - 2026-09-07

### Added

- **OpenCode Go** provider channel (`https://opencode.ai/docs/go/`): bundled `data/opencode-go.json` with 28 published Go model prices, `src/lib/sources/opencode-go.ts` adapter, `opencode` channel offers merged in `npm run sync`, explorer filter (`All Providers` / `OpenRouter` / `Cursor Models Only` / `OpenCode Go`), `OpenCodeGoModelFacts` pricing panel, footer/docs/methodology attribution, and live model list pointer (`https://opencode.ai/zen/go/v1/models`, config id `opencode-go/<model-id>`).
- Site footer now shows the release version (`v0.2.0`) next to the copyright line.
- Ingested and integrated **CursorBench 3.2** benchmark dataset (`https://cursor.com/cursorbench`, stored in `data/cursorbench.json`) covering 60 model configurations across 16 model families.
- Integrated CursorBench metrics into model calculation: CursorBench benchmark score (0–100%), measured average cost per task, measured tokens per task, and steps per task.
- Channel-aware weighting in scoring (`src/lib/scoring.ts`): CursorBench capability scores receive 2.5× higher weightage when calculating domain scores and efficiency in the Cursor section (`channelFilter === "cursor"`), and CursorBench measured task costs are prioritized for models benchmarked on Cursor.
- Dedicated CursorBench metrics display in `CursorModelFacts.tsx` (Score, Cost/Task, Tokens/Task, Steps/Task, and link to docs).
- Added sortable `CursorBench` column in `ModelExplorer` table and active status banner in the Cursor section.
- Extended `ParetoScatter.tsx` to support `cursorbench` Y-axis visualization with CursorBench metric tooltips.
- Automated CursorBench ingestion during `npm run sync`.
- Unit tests verifying CursorBench calculations and Cursor-section weightage.

- Production readiness: required `SITE_URL` for builds, per-page canonical/Open Graph URLs, JSON-LD (`Organization`, `WebSite`, `WebApplication`, `Dataset`, `BreadcrumbList`), branded `404` page, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, security headers (`public/_headers`), and CI artifact guards.
- Shared site chrome (`SiteHeader`, `SiteFooter`, `Breadcrumbs`) with active nav, skip link, and non-React theme toggle.
- Social share images (`og.png`, `og-methodology.png`) plus `apple-touch-icon.png`.
- PR CI workflow (`.github/workflows/ci.yml`) running tests, `astro check`, production build, and dist audits.
- Unit tests for site URL/canonical/schema helpers.

### Changed

- Public site copy, home intro, site meta descriptions, `llms.txt`, and README rewritten in pragmatic Simple English.
- Shared chrome (`SiteHeader`, `SiteFooter`) and page heroes on Explorer, Methodology, and 404 now share Woken/shadcn spacing, larger titles, and rounded cards. Removed unused `Breadcrumbs` UI under the primary nav.
- Methodology **Sync** section replaced by **Data freshness**. A GitHub Actions workflow refreshes the matrix daily at 04:00 UTC. Visitors read freshness at `/api/health`.
- Ranking-control titles (including Profile, Provider channel, floors, switches, weight presets, sliders, Search, Effort, Provider filter, Sort by, and the Ranking controls button) use Simple English terminology hover help.
- Reframed the chart hierarchy around the public **Effiq Score** name: the primary full-width chart now plots Effiq Score against task cost, with capability/cost and throughput/latency diagnostics displayed side by side below it.
- Renamed user-facing “Efficiency Score” and abbreviated “Eff” labels to **Effiq Score** while retaining the internal scoring field for compatibility.
- Long model-variant names now marquee within chart tooltips instead of being truncated.
- Switched the speed chart to plot throughput on the horizontal axis and latency on the vertical axis.
- Kept chart X-axes on honest zero-origin linear scales while making Y-axes distribution-aware: focused linear extents for compact ranges and adaptive logarithmic extents for strongly skewed positive data.
- Users can hold Ctrl/⌘ and scroll over an individual chart to zoom around the pointer, then reset the view.
- Chart labels now use measured collision boxes and hide lower-priority names when no clear placement exists; all model dots remain available on hover.
- Chart tooltips now show input, output, and cache-read prices together in one compact per-million-token row.
- Chart tooltips now close immediately when the pointer leaves their model dot.
- Switched the primary chart to place Effiq Score on the horizontal axis and task cost on the vertical axis.
- Added dotted Pareto-frontier lines connecting each chart’s non-dominated models, with metric-aware higher/lower-is-better direction.
- Disabled Vite production source maps.
- Model explorer hydrates on idle; Pareto charts and model-fact panels load as deferred chunks to shrink initial JavaScript.
- `.env.example` and deployment docs: `SITE_URL` is required for production; removed stale `SYNC_TOKEN` / `POST /api/sync` guidance.

### Removed

- Developer `npm run sync` instructions from public pages (`methodology`, explorer chrome, `llms.txt` adapter notes). README and `docs/` keep the command for operators.
- React `ThemeToggle` island (replaced by a lightweight Astro/header control).
- Static placeholder `public/robots.txt` pointing at `models.example.com`.

### Security

- Cloudflare Pages headers: CSP, frame denial, nosniff, referrer/permissions policies, COOP, HSTS.
- Build fails on missing or placeholder production domains so canonical/social URLs cannot ship as `example.com`.
- Dependency audit clean at high severity after `npm audit fix` (`fast-uri` / related transitive updates).

### Added

- Logarithmic X-axis scaling for Pareto scatter plots (`taskCost` and `latency`) with dynamically generated decades and intermediate ticks (`$0.001`, `$0.002`, `$0.005`, `$0.01`, `$0.02`, `$0.05`, `$0.10`, `$0.20`, `$0.50`, `$1.00`, etc.), eliminating severe leftward clumping and evenly spreading models across the horizontal space.
- Collision-aware, multi-angle label placement algorithm (`top`, `bottom`, `top-right`, `top-left`, `bottom-right`, `bottom-left`, `top-far`, `bottom-far`) with contrast stroke outlines and hairline connectors for spaced labels.
- Full-width stacked layout for plot charts (Capability vs. Task Cost and Throughput vs. Latency on separate rows) giving 2.7x more horizontal room for model dots and labels.
- Support for newly released OpenAI models including **GPT-6 Astra** (`openai/gpt-6-astra`) and **GPT-6 Astra Pro** (`openai/gpt-6-astra-pro`).
- Auto-refresh mechanism in `scripts/sync.ts` when OpenRouter cache is older than 24 hours, preventing new models from being missed due to stale local caches.
- Light and dark theme switcher in the header with localStorage persistence and no flash on reload.
- Numerical axis markings (ticks) and dashed grid lines for both X and Y axes on Pareto scatter plots.
- Axis unit indicators on Pareto scatter plots (`Task cost ($ USD) →`, `Latency (ms) →`, `Domain score (0–100) ↑`, `Throughput (tokens/sec) ↑`).
- Fixed scatter plot dots with permanent subtle model names positioned directly above each dot.
- Interactive speech bubble tooltip on dot hover with full model metrics breakdown, parent badge, and efficiency score.
- Provider / channel filter toggle (`All Providers`, `OpenRouter`, and `Cursor Models Only`) to filter models by provider channel.
- Dedicated Cursor-specific pricing view (`CursorModelFacts`) showing Cursor published rates (input, output, cache read per 1M tokens), model IDs, and task slugs when Cursor models are selected.

### Changed

- Updated top header copy to distinguish measured model providers (**OpenRouter & Cursor**) from evaluation benchmark sources (Artificial Analysis).

- Track task completion time (`taskTimeSeconds`) from Artificial Analysis (`median_end_to_end_response_time_seconds`), including table column, sort support, expanded breakdown, and CSV/JSON export.
- Model parent color-coding for scatter plot dots and table variants (Anthropic, OpenAI, Google, Meta, DeepSeek, Mistral, Qwen/Alibaba, xAI, Microsoft, Amazon, Cohere) with an active parent legend.
- Lazy-loaded OpenRouter model facts, architecture specifications, context window, and live provider pricing table on model expansion (`OpenRouterModelFacts`).
- 100% static output build support (`output: 'static'`) for zero-backend Cloudflare Pages hosting.
- Scheduled GitHub Actions sync workflow (`.github/workflows/sync.yml`) running daily at 04:00 UTC with automatic commit and push to trigger Cloudflare Pages deploys.
- Repo-relative fallback resolution in `scripts/sync.ts` with bundled `data/aa-catalog.json` and `data/cursor-models.csv`.
- Static build prerendering for `/api/models.json`, `/api/models.csv`, and `/api/health`.

### Changed

- Realigned Pareto scatter plot axis labels: Domain score and Throughput placed at the top-left, and Task cost and Latency placed at the bottom-right just below the ending of the chart.
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
