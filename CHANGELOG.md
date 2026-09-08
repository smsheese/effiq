# Changelog

All notable changes to **effiq** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Content Security Policy: the live data bucket (`https://a.effiq.shee.se`) was missing from `connect-src`, so the explorer's bucket fetch was blocked in production; also allowed the Cloudflare Web Analytics beacon (`static.cloudflareinsights.com` for script/connect) that Pages injects.

## [0.3.0] - 2026-09-08

### Changed

- Data distribution moved from git to a public S3-compatible bucket (Cloudflare R2). The daily sync workflow no longer commits generated files (no more `chore(data)` bot commits and rebuild churn): it uploads `models-matrix.json/.csv` + `sync-manifest.json` to `<prefix>/latest/`, archiving the previous latest under its `generatedAt` timestamp in `<prefix>/archive/`. The explorer now fetches the live bucket copy (`PUBLIC_MATRIX_URL`) with the prerendered `/api/models.json` as fallback, so daily data updates reach users without a rebuild or redeploy; a freshness label ("rankings updated X ago") shows the data age. Generated files are gitignored and untracked — regenerate locally with `npm run sync` or pull with `npm run data:pull` (`scripts/fetch-data.mjs`). CI pulls current data from the bucket before building.
- Dataset URLs advertised in `llms.txt` and the Dataset JSON-LD now point at the public bucket URLs (falling back to the baked `/api/models.json|csv` routes when `PUBLIC_MATRIX_URL` is unset).

### Added

- Explorer table: page-level sticky header and pinnable rows. The table is no longer boxed in a scrolling container — it spans the page (narrow viewports scroll the page horizontally) so the header row sticks to the top of the viewport just under the site header, and each row has a pin toggle (max 3) that keeps it visible below the header for side-by-side comparison, with pinned rows floated to the top of the table. Sticky offsets are measured in JS (`--effiq-sticky-top`, `--effiq-pin-top`) so pinned rows stack without overlap.
- Explorer compare: per-row compare checkbox replaced with a compare-icon button (max 5; a 6th pick is blocked with an inline hint instead of evicting). Adding a model animates a flying envelope from the row button to a floating `Compare (n)` button fixed at the top right; tapping it opens a right-side slide-over drawer (CompareDrawer.tsx) with a metric-row differences table — best value per row highlighted, deltas vs best, per-model remove and clear-all. The old inline compare card block above the charts is removed.
- Feedback collection via Tally (`tally.so` popup, form `1AeRVl`): embed widget script in the site `<head>`, a header Feedback button and footer Feedback link with the popup data attributes, and CSP allowances for `https://tally.so` (script, connect, frame, form-action, img) so the popup loads on Cloudflare Pages.
- Explorer ranking table: compare moved to a per-row checkbox column before the serial number, model titles capped at 25 characters with a scrolling marquee (pauses on hover, disabled under reduced-motion) for longer names, reasoning effort stripped from display names since the effort pill already shows it, effort pills shaded white (none) to bright red (max), and numeric cells heat-colored red → orange → yellow → green across each column's range with correct polarity (green = smarter/faster/cheaper as appropriate).
- Subscriptions advisor now weights tool integration as the third ranking factor (after cost, then intelligence): every plan carries a `portability` level — open (ChatGPT sign-in, OpenRouter, OpenCode Go), vendor-tools-only (Cursor), or harness-locked (Claude: official Claude Code/Cowork/Agent SDK only, subscription auth in third-party harnesses violates Anthropic ToS with ban risk) — shown as color-coded badges with tools and risk notes on cards and bucket tables. New "Must work in third-party tools" toggle excludes non-open plans from recommendations (dimmed with a lock note), a fourth "Most portable fit" recommendation card, and the ranking now uses each plan's Effiq Score (coding profile) with portability as the same-fee tiebreak: cost → Effiq → portability.
- Subscriptions advisor now leads with a monthly budget slider ($10–$200, first control on the page): plans above budget stay visible but dimmed with an over-budget note and drop out of the Best-fit / Cheapest / Most-headroom ranking; an "Over $200 (no cap)" toggle re-includes them, and sliding to $200 auto-enables it. New `monthlyBudget` input and `planVerdictDatum` helper in `src/lib/subscriptionAdvisor.ts` (budget filtering tested).
- Subscriptions now compare metered spend too: OpenRouter $20/$50/$100 pay-as-you-go budgets and OpenCode Go $20/$50/$100 ($10 membership + Zen credits), judged in the same advisor with Zen offer tariffs preferred via a new `tariffChannel` field; advisor buttons, segmented pills, and slider labels restyled to the explorer's control pattern.
- `/subscriptions/` is now a consumption-fit advisor, not just a fee table. New controls — tasks/month slider, task-size pills (Q&A / coding / agent loop / deep work, mapped to workload templates with stated msgs-per-task and hours-per-task assumptions), steady-vs-bursty rhythm toggle (~20 vs ~8 sessions/mo), and a minimum-intelligence slider — drive per-plan Fits/Tight/Over verdicts computed in each plan's native unit (Claude weekly hours, Cursor monthly API-dollar pools, ChatGPT messages per 5h session) plus headroom bars and a Best-fit / Cheapest-that-fits / Most-headroom strip. Each card shows the plan's smartest model with its measured intelligence index and the included-capacity range with official/community/derived badges. New `src/lib/subscriptionAdvisor.ts` pure module with unit tests; page embeds its data as JSON and mirrors the math inline.
- ChatGPT Pro 100 ($100/mo, 5x Plus) added as its own plan after the official help center confirmed two Pro tiers; ChatGPT Business corrected to measured $25 monthly / $20 annual per the official Codex pricing page, with Standard = Plus-level Codex allowance and higher tiers ≈ Pro 5x. New official capacity anchors: Plus Sol 10–100 through Pro 20x 200–2000 Codex messages/5h, GPT-6 Pro chat pools (200/wk, 50/wk shared, 15/mo shared), Claude Pro 40–80 and Max 5x 140–280 Sonnet hrs/wk (via HN-archived Anthropic announcements), Cursor $60–100/mo daily-driver guidance.
- `/subscriptions/` comparison page for coding flat-fee plans by budget bucket (Up to $20 / $50 / $100 / Over $100): Claude Pro ($20), Max 5x ($100), Max 20x ($200), ChatGPT Plus ($20), Pro ($200), Business (~$25/seat), Cursor Pro ($20), Pro Plus ($60), Ultra ($200), Teams Standard ($40/seat), Premium ($120/seat). Each bucket shows monthly/annual fees, Claude Code vs Codex access, 5-hour and weekly limits, and overage credits, plus an interactive tasks-per-month slider computing effective $/task with a break-even count against the cheapest measured metered task. Prices stay labeled measured (Business estimated — its price renders client-side); all quotas stay estimated (prose-only, no quota API). Backed by `data/subscription-plans.json`, `src/lib/sources/subscriptions.ts` validation (unknown ids and bucket drift fail loudly), `sync.ts` manifest entries (`claude_subscription`, `chatgpt_subscription`, `cursor_subscription`), opt-in `agent_refresh.py` price refresh (`--only claude_sub`; ChatGPT auto-refresh disabled like CursorBench to avoid confabulated amounts), header/footer nav, sitemap, `llms.txt`, and WebPage JSON-LD.
- Fixed the Cursor seed refresh: `cursor.com/docs/models-and-pricing.md` now 404s, so the agent refresh fetches the HTML docs page instead. Re-verified Cursor pricing against the live docs on 2026-09-08 — per-model CSV prices all match (including Grok 4.5 Fast output $18 and Fable 5.1 cache-read $0.25) — and confirmed plan prices: Pro $20, Pro Plus $60, Ultra $200, Teams Standard $40/seat, Premium $120/seat, Start ₹649 (India), Hobby free, Enterprise custom. Docs guidance captured in plan notes: daily agent users typically run $60–100/mo total usage, power users $200+; Teams/Enterprise third-party requests add a $0.25/M Cursor Token Rate.
- Server-rendered "Top picks right now" section on the home page: a static top-10 ranking table, headline leaders, and concrete model/price sentences built at build time from the canonical matrix (`src/lib/topPicks.ts`). Crawlers and JS-less AI agents now see the primary content in the initial HTML instead of "Loading Effiq rankings…".
- `/about/` page with maintainer identity, contact route, and `Person` + `WebPage` JSON-LD; About link added to header nav and footer; footer attribution now links to the maintainer and the GitHub repository.
- Visible matrix freshness stamps (`<time datetime>` fed from the daily build) on the home page and methodology page, plus `dateModified` in `WebPage` JSON-LD on methodology.
- `topPicks.test.ts` covers the snapshot shape (row limit, descending scores, leader consistency).
- Agent seed refresh (`scripts/agent_refresh.py`, `npm run sync:agent`): fetches the docs sites' machine-readable markdown (`cursor.com/docs/models-and-pricing.md`, `opencode.ai/docs/go.md` — the HTML pages are JS apps) and extracts rows with an OpenRouter chat model (temperature 0, JSON-only) into `data/cursor-models.csv` and `data/opencode-go.json`. Merges are update-only (new models appended, nothing deleted) with guards: minimum-row counts reject partial extractions and fast-mode rows only take prices from explicit `(Fast)` docs entries. `--dry-run` and `--self-test` supported. CursorBench is excluded by design (results only in chart SVG coordinates — trial runs confabulated rows), so it stays a manual snapshot. Wired best-effort (`continue-on-error`) into the daily sync workflow ahead of `npm run sync`; skips cleanly without `OPENROUTER_API_KEY`, model pinned via `REFRESH_MODEL` (default `openai/gpt-5.6-luna` with `high` reasoning effort, overridable via `REFRESH_REASONING_EFFORT`).
- Explorer now persists locked weight keys (up to 4) and the active weight preset in local storage alongside weights, profile, and intelligence floor.
- Explorer weight sliders get a lock toggle: locked sliders stay fixed while the remaining sliders share the weight remainder, with hover help, a locked counter, and the lock limit surfaced in tooltips.
- Explorer cost range filters: min–max inputs for input $/1M, output $/1M, and effective task $ with a one-click clear.

### Fixed

- Replaced the stale Astro-default `public/favicon.ico` with the eq logo (multi-size ICO matching `favicon.svg`); the tab icon no longer shows the Astro default.
- Duplicate sitemaps resolved: the `@astrojs/sitemap` integration (which emitted a conflicting `/sitemap-index.xml` + `sitemap-0.xml`) is removed; the hand-written `/sitemap.xml` is the single source of truth, listing only HTML pages (`/`, `/methodology/`, `/about/`) with `lastmod` derived from the matrix `generatedAt` instead of wall-clock build time, and without ignored `changefreq`/`priority` fields.
- Organization JSON-LD logo is now a raster `ImageObject` (`apple-touch-icon.png`, 180×180) instead of `favicon.svg`.
- Homepage `WebSite` node gets an `@id`; the methodology `WebPage` references it by `@id` instead of embedding a duplicate.
- `robots.txt` simplified to `Allow: /` plus `Disallow: /api/health` (crawlers no longer hit the health endpoint); `llms.txt` notes now describe the server-rendered snapshot and daily refresh instead of "ranks in the browser".
- JSX whitespace stripping fixed across all pages: text directly followed by inline elements (`<strong>`, `<em>`, `<code>`, `<time>`) — and inline closes directly followed by text — now render with proper spaces via explicit `{" "}` markers. Affected spots: home hero and top-picks sentences, about intro/scoring-guide/freshness paragraphs, footer attribution and copyright, and matrix-freshness timestamps. Verified zero prose-adjacency issues remain in the built HTML.

### Changed

- Header tagline ("Capability per task dollar · OpenRouter, Cursor & OpenCode Go") removed — the header now shows only the logo, nav, feedback, and theme controls.
- Site IA simplified: `/methodology/` merged into `/about/` as a "Scoring guide" section (anchor `#methodology`); header nav is now Explorer → Subscriptions → About (About last), footer and 404 updated, home CTA points at the scoring guide, `/methodology/` 301-redirects to `/about/` via `public/_redirects`, and sitemap/llms.txt drop the old URL. The merged about page uses the same wide page shell (`max-w-[1500px]`) as the explorer and subscriptions pages — prose blocks stay constrained to a reading measure inside — so page width no longer jumps between pages.
- Home title and H1 now target real queries: "LLM cost comparison — cheapest AI models per task dollar | effiq" / "LLM cost comparison, ranked per task dollar" (was brand-first title, "Model efficiency explorer" H1).
- Dataset JSON-LD carries `dateModified` (from the matrix build) and `license`; `WebApplication` JSON-LD carries `dateModified` (SEO audit: freshness is the product pitch but was invisible).
- Static OG/favicon caching raised from 1 day to 7 days in `public/_headers` (hashed `/_astro/*` assets already immutable).
- README links the live site (https://effiq.shee.se) and fixes the clone URL to `https://github.com/smsheese/effiq.git`.
- Header tagline names all three provider channels (OpenRouter, Cursor, and OpenCode Go).
- Copy on the home hero, explorer footer, and `llms.txt` clarifies that the EQ (Effiq) Score is not fixed — it changes with the visitor's profile, weights, floors, and filters.
- Data refresh: matrix re-synced on 2026-09-07 with 1184 variants (0 added, 0 removed). All live sources healthy — Artificial Analysis (643 rows), Cursor (363), OpenRouter (982), OpenCode Go (28).
- Sync workflow now passes `OPENROUTER_API_KEY` through to `npm run sync` so an optional secret enables authenticated OpenRouter fetches with higher rate limits.

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
