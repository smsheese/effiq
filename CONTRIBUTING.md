# Contributing to effiq

Thanks for helping improve **effiq** (efficiency × IQ).

## Setup

```sh
git clone git@ghsmsheese:smsheese/effiq.git
cd effiq
cp .env.example .env
npm install
npm run sync
npm run dev
```

## Workflow

1. Open an issue or describe the change you want.
2. Branch from `main`: `git checkout -b feat/short-name`.
3. Keep commits focused. Prefer `feat:`, `fix:`, `docs:`, `chore:` prefixes.
4. Run `npm test` and `npm run build` before opening a PR.
5. Update docs (`README`, `CHANGELOG` Unreleased, `ROADMAP` checkboxes) when behavior changes.

## Project layout

| Path | Role |
|------|------|
| `src/lib/schema.ts` | Canonical types |
| `src/lib/sources/` | Source adapters |
| `src/lib/estimation.ts` | Missing-variant estimates |
| `src/lib/scoring.ts` / `profiles.ts` | Ranking |
| `scripts/sync.ts` | Matrix build |
| `src/components/ModelExplorer.tsx` | UI |
| `data/models-matrix.json` | Published catalog |

## Secrets

Never commit API keys. Use `.env` locally and GitHub Actions / host secrets in CI.
See [docs/DATA_SOURCES.md](./docs/DATA_SOURCES.md) and [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

## Code style

- TypeScript strictness as configured; no drive-by refactors.
- Measured vs estimated metrics must stay labeled in UI and schema.
- New data sources need provenance fields and a DATA_SOURCES note.
