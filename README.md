# effiq

**effiq** ranks LLM **reasoning variants** by capability per real or estimated
task dollar. The default view keeps Artificial Analysis Intelligence at **40**
or more. Then it sorts by a public Effiq Score. You can change the weights.

Live site: **https://effiq.shee.se**

The site compares capability against cost at each effort level
(`low` / `medium` / `high` / `xhigh` / `max`) across OpenRouter, Cursor,
OpenCode Go, and Artificial Analysis.

> Status: **v0.2.0**. Cloudflare Pages hosts the static build. A GitHub Actions workflow refreshes the model matrix each day and publishes it to a public S3/R2 bucket; the explorer reads the live data, so updates need no redeploy.

## Features

The explorer includes:

- Intelligence floor. The default is 40. You can change it in the live explorer
- Eight usage profiles. General, Coding, Agents, Math and Science, Finance, Research, Writing and Literature, Multimodal
- Six weight sliders. Intelligence, coding, agentic, task cost, latency, throughput
- Measured Artificial Analysis task cost when it exists. Labeled workload estimates otherwise
- Hierarchical approximations for missing reasoning variants
- Provider offers, sticky header with pinnable rows, compare drawer (up to 5 models with best-value highlighting), Pareto scatters, CSV and JSON export
- Canonical multi-source matrix from `npm run sync`

## Quick start

```sh
cp .env.example .env   # optional; defaults work if AA/Cursor paths exist
npm install
npm run sync           # builds data/models-matrix.json
npm run dev            # http://localhost:4321
npm test
npm run build
```

## Documentation

| Doc | Purpose |
|-----|---------|
| [README.md](./README.md) | Overview and operations |
| [ROADMAP.md](./ROADMAP.md) | Near / mid / long-term plans |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to contribute |
| [docs/DATA_SOURCES.md](./docs/DATA_SOURCES.md) | Sources, auth, enablement |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | VPS, Cloudflare Pages, secrets |
| [.env.example](./.env.example) | Environment template |

## Ranking model (summary)

| Concept | Default |
|---------|---------|
| Intelligence floor | 40 (hard gate) |
| Effiq Score weights | 35% intel · 15% coding · 10% agentic · 30% cost · 5% latency · 5% throughput |
| CursorBench weight | Included in domain scoring. 2.5× higher weight in the Cursor section |
| Task cost | CursorBench measured cost/task on Cursor, Artificial Analysis measured cost/task, else profile workload × tariffs |
| Missing efforts | interpolate → extrapolate → family estimate → insufficient |
| Approximations | labeled. Conservative bounds are optional |

## Data pipeline

```sh
npm run sync
```

| Source | Role | Auth |
|--------|------|------|
| Artificial Analysis catalog | Indexes, measured task cost, AA pricing/perf | File path or AA API key |
| OpenRouter `models/find` | Provider offers, latency/throughput | None for public catalog |
| Cursor CSV | Effort/fast/thinking variants + Cursor prices | CSV file (key only to regenerate) |
| OpenCode Go seed | 28 Go models + published token prices + Zen endpoints | Bundled `data/opencode-go.json` |
| Subscription plans | Claude Pro/Max + ChatGPT Plus/Pro/Business flat fees for `/subscriptions/` | Bundled `data/subscription-plans.json` (manual snapshot; quotas estimated) |

Website pages (not APIs) feed Cursor pricing and OpenCode Go (CursorBench stays
a manual snapshot — its results page is JS-rendered with no readable table).
`npm run sync:agent` refreshes those seeds with an OpenRouter model
(`OPENROUTER_API_KEY`, optional `REFRESH_MODEL`) before `npm run sync` merges
them; it skips cleanly without a key.

Outputs: `data/models-matrix.json`, `data/models-matrix.csv`,
`data/sync-manifest.json`. Details: [docs/DATA_SOURCES.md](./docs/DATA_SOURCES.md).

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/models.json` | Canonical matrix (static JSON) |
| `GET /api/models.csv` | CSV download (static CSV) |
| `GET /api/health` | Freshness + sync manifest |
| `GET /robots.txt` | Crawl rules (from `SITE_URL`) |
| `GET /sitemap.xml` | Public URL sitemap |
| `GET /llms.txt` | Site summary for LLM agents |

## Deploy

- **Cloudflare Pages.** See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for Git deploy settings and the required `SITE_URL`.
  That page also covers custom domains, security headers, and the GitHub Actions daily refresh workflow.
- Discovery endpoints after deploy: `/robots.txt`, `/sitemap.xml`, `/llms.txt`, branded `/404`.

## Stack

- Astro 7 (static build for Cloudflare Pages)
- React 19 + TypeScript (explorer island. Charts and facts code-split)
- Tailwind CSS v4 + shadcn/ui ([Woken](https://tweakcn.com/themes/cmt3ah8fc000004id2kh74do2) theme via tweakcn)
- Vitest for scoring, identity, estimation, and site metadata tests

## License

[MIT](./LICENSE) © 2026 smsheese

## Repository

```sh
git clone https://github.com/smsheese/effiq.git
```

## Attribution

Benchmark indexes and measured task costs: [Artificial Analysis](https://artificialanalysis.ai).
Provider catalog and live routing metrics: [OpenRouter](https://openrouter.ai).
Cursor variant pricing: Cursor public docs / models API (via local CSV export).
OpenCode Go pricing: [OpenCode Go docs](https://opencode.ai/docs/go/) (bundled `data/opencode-go.json`, full list at `https://opencode.ai/zen/go/v1/models`).

## Name

**effiq** = efficiency × IQ.
