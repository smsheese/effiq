# effiq

**effiq** ranks LLM **reasoning variants** by capability delivered per real or
estimated task dollar. Default view keeps Artificial Analysis Intelligence ≥
**40**, then sorts by a transparent Efficiency Score you can reweight.

Built for **token-efficiency-maxxing**: not only the smartest model, but the
smartest *affordable* effort level (`low` / `medium` / `high` / `xhigh` / `max`)
across OpenRouter, Cursor, and Artificial Analysis.

> Status: **v0.2.0-ready** — Pure static build deployed to **Cloudflare Pages**, with automated daily sync via GitHub Actions.

## Features

- Intelligence floor (default 40), adjustable live
- Eight usage profiles: General, Coding, Agents, Math & Science, Finance,
  Research, Writing & Literature, Multimodal
- Six weight sliders: intelligence, coding, agentic, task cost, latency, throughput
- Measured AA task cost when available; labeled workload estimates otherwise
- Hierarchical approximations for missing reasoning variants
- Provider offers, compare (up to 3), Pareto scatters, CSV/JSON export
- Canonical multi-source matrix via `npm run sync`

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
| [README.md](./README.md) | Overview and ops |
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
| Efficiency weights | 35% intel · 15% coding · 10% agentic · 30% cost · 5% latency · 5% throughput |
| Task cost | AA measured cost/task, else profile workload × tariffs |
| Missing efforts | interpolate → extrapolate → family estimate → insufficient |
| Approximations | labeled; conservative bounds optional |

## Data pipeline

```sh
npm run sync
```

| Source | Role | Auth |
|--------|------|------|
| Artificial Analysis catalog | Indexes, measured task cost, AA pricing/perf | File path or AA API key |
| OpenRouter `models/find` | Provider offers, latency/throughput | None for public catalog |
| Cursor CSV | Effort/fast/thinking variants + Cursor prices | CSV file (key only to regenerate) |

Outputs: `data/models-matrix.json`, `data/models-matrix.csv`,
`data/sync-manifest.json`. Details: [docs/DATA_SOURCES.md](./docs/DATA_SOURCES.md).

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/models.json` | Canonical matrix (static JSON) |
| `GET /api/models.csv` | CSV download (static CSV) |
| `GET /api/health` | Freshness + sync manifest |

## Deploy

- **Cloudflare Pages:** see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for 1-click Git deploy settings and GitHub Actions daily sync workflow.

## Stack

- Astro 7 (Static build for Cloudflare Pages)
- React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui ([Woken](https://tweakcn.com/themes/cmt3ah8fc000004id2kh74do2) theme via tweakcn)
- Vitest for scoring/identity/estimation tests

## License

[MIT](./LICENSE) © 2026 smsheese

## Repository

```sh
git clone git@ghsmsheese:smsheese/effiq.git
```

## Attribution

Benchmark indexes and measured task costs: [Artificial Analysis](https://artificialanalysis.ai).  
Provider catalog and live routing metrics: [OpenRouter](https://openrouter.ai).  
Cursor variant pricing: Cursor public docs / models API (via local CSV export).

## Name

**effiq** = efficiency × IQ.
