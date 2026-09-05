# AGENTS.md — effiq

## Project

**effiq** (efficiency × IQ) ranks LLM reasoning variants by capability per task dollar.

## Development

```sh
npm run sync    # refresh data/models-matrix.json
npm run dev     # prefer: astro dev --background
npm test
npm run build
```

Manage background Astro with `astro dev stop`, `astro dev status`, `astro dev logs`.

## Docs to read before changing behavior

- [README.md](./README.md)
- [ROADMAP.md](./ROADMAP.md)
- [docs/DATA_SOURCES.md](./docs/DATA_SOURCES.md)
- Astro: https://docs.astro.build

## Rules for agents

- Do not put secrets in client code or commit `.env`.
- Keep measured vs estimated metrics labeled.
- Prefer editing existing modules under `src/lib/` over new frameworks.
- After scoring/sync changes, run `npm test` and update CHANGELOG Unreleased.
