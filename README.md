# effiq

**effiq** ranks LLM **reasoning variants** by capability per real or estimated
task dollar. The default view keeps Artificial Analysis Intelligence at **40**
or more. Then it sorts by a public Efficiency Score. You can change the weights.

The site compares capability against cost at each effort level
(`low` / `medium` / `high` / `xhigh` / `max`) across OpenRouter, Cursor, and
Artificial Analysis.

> Status: **v0.2.0-ready**. Cloudflare Pages hosts the static build. A GitHub Actions workflow refreshes the matrix each day.

## Features

The explorer includes:

- Intelligence floor. The default is 40. You can change it in the live explorer
- Eight usage profiles. General, Coding, Agents, Math and Science, Finance, Research, Writing and Literature, Multimodal
- Six weight sliders. Intelligence, coding, agentic, task cost, latency, throughput
- Measured Artificial Analysis task cost when it exists. Labeled workload estimates otherwise
- Hierarchical approximations for missing reasoning variants
- Provider offers, compare (up to 3), Pareto scatters, CSV and JSON export
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
| Efficiency weights | 35% intel · 15% coding · 10% agentic · 30% cost · 5% latency · 5% throughput |
| Task cost | Artificial Analysis measured cost/task, else profile workload × tariffs |
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

Outputs: `data/models-matrix.json`, `data/models-matrix.csv`,
`data/sync-manifest.json`. Details: [docs/DATA_SOURCES.md](./docs/DATA_SOURCES.md).

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/models.json` | Canonical matrix (static JSON) |
| `GET /api/models.csv` | CSV download (static CSV) |
| `GET /api/health` | Freshness + sync manifest |

## Deploy

- **Cloudflare Pages.** See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for Git deploy settings and the GitHub Actions daily refresh workflow.

## Stack

- Astro 7 (static build for Cloudflare Pages)
- React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui ([Woken](https://tweakcn.com/themes/cmt3ah8fc000004id2kh74do2) theme via tweakcn)
- Vitest for scoring, identity, and estimation tests

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
