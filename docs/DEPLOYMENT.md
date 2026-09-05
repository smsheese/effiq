# Deployment — effiq

## Local

```sh
cp .env.example .env
npm install
npm run sync
npm run dev
```

## Node / VPS (supported in v0.1.0)

1. Build: `npm ci && npm run sync && npm run build`
2. Sync `dist/`, `data/models-matrix.*`, `deploy/`, `package.json` to the host
   (e.g. `/var/www/effiq/`)
3. Install units:

```sh
sudo cp deploy/effiq.service /etc/systemd/system/
sudo cp deploy/effiq-sync.service /etc/systemd/system/
sudo cp deploy/effiq-sync.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now effiq.service
sudo systemctl enable --now effiq-sync.timer
```

4. Point nginx at `127.0.0.1:4321` (see `deploy/nginx.conf`).
5. Set `EnvironmentFile=/var/www/effiq/.env` with at least:

```bash
SITE_URL=https://your.domain
HOST=127.0.0.1
PORT=4321
SYNC_TOKEN=long-random-secret
MATRIX_FILE=./data/models-matrix.json
```

Manual sync: `curl -X POST -H "Authorization: Bearer $SYNC_TOKEN" https://your.domain/api/sync`

## Cloudflare Pages (planned — v0.2)

Current stack uses `@astrojs/node` + filesystem APIs. Pages needs:

1. Cloudflare adapter or static export + bundled matrix
2. GitHub Actions daily sync (secrets for AA/Cursor; no secrets in Pages runtime)
3. Disable process-spawn `POST /api/sync` on Pages

Until then, use VPS/Node or local preview.

## Secrets matrix

| Variable | Local `.env` | GitHub Actions | Cloudflare Pages |
|----------|--------------|----------------|------------------|
| `SITE_URL` | yes | yes | yes |
| `SYNC_TOKEN` | VPS only | optional | no |
| `ARTIFICIAL_ANALYSIS_API_KEY` | optional | yes (sync job) | no |
| `CURSOR_API_KEY` | optional | optional | no |
| `OPENROUTER_REFRESH` | optional | `1` in sync job | no |

## Health

`GET /api/health` → matrix age, sync lock, manifest source status.
