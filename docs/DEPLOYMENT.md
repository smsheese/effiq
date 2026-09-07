# Deployment — effiq

## Architecture

**effiq** is deployed as a **100% static site on Cloudflare Pages**. There is no backend process running at request time:
- **Build time:** Astro compiles static HTML and exports `data/models-matrix.json` and `data/models-matrix.csv` into `dist/api/`. Discovery files (`robots.txt`, `sitemap.xml`, `llms.txt`), a branded `404.html`, and `public/_headers` ship with the build.
- **Browser:** The React explorer hydrates on idle, fetches `/api/models.json` once, then runs filtering, weight sliders, Pareto charts, and ranking client-side. Chart and model-fact modules load as separate chunks.
- **Data sync:** A scheduled GitHub Actions workflow (`.github/workflows/sync.yml`) runs daily (or on manual trigger), pulls updated model data, commits the fresh matrix to `main`, and automatically triggers Cloudflare Pages to rebuild.

---

## Cloudflare Pages Setup

1. In Cloudflare Dashboard, go to **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
2. Select the repository and the `main` branch.
3. Configure build settings:
   - **Framework preset:** `Astro`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node.js version:** Set environment variable `NODE_VERSION = 22` (recommended).
4. **Required build environment variable:**
   - `SITE_URL` = your public HTTPS origin, for example `https://effiq.pages.dev` or `https://your-custom-domain.tld`
   - Builds **fail** if `SITE_URL` is missing, invalid, or still an `*.example.*` placeholder.
5. **Secrets on Pages:** Leave blank. No API keys are needed on Cloudflare Pages (runtime is secret-free).

### Custom domain

1. In the Pages project, open **Custom domains** and add your hostname.
2. Follow Cloudflare’s DNS instructions (usually a CNAME to your `*.pages.dev` project).
3. Set Pages build env `SITE_URL` to the same HTTPS origin you want in canonical tags, Open Graph URLs, `robots.txt`, and `sitemap.xml`.
4. Redeploy so metadata and discovery files regenerate against the real domain.

### Security headers

`public/_headers` is copied into `dist/` and applied by Cloudflare Pages. It sets CSP (self + required inline theme bootstrapping), `X-Frame-Options`, `nosniff`, referrer/permissions policies, COOP, and HSTS.

---

## Periodic Sync & GitHub Actions Secrets

Periodic updates are handled by GitHub Actions (`.github/workflows/sync.yml`).

PR/push verification is handled by `.github/workflows/ci.yml` (`npm test`, `astro check`, production build, artifact guards).

### Configuring Secrets in GitHub

Go to **Repo Settings** -> **Secrets and variables** -> **Actions**:

| Secret / Variable | Type | Purpose |
|-------------------|------|---------|
| `ARTIFICIAL_ANALYSIS_API_KEY` | Secret | Optional / future live AA sync |
| `CURSOR_API_KEY` | Secret | Optional / regenerate Cursor models |
| `HF_TOKEN` | Secret | Optional Hugging Face token |
| `AA_CATALOG_PATH` | Variable | Override path to AA catalog JSON (defaults to `data/aa-catalog.json`) |
| `CURSOR_MODELS_CSV` | Variable | Override path to Cursor CSV (defaults to `data/cursor-models.csv`) |
| `SITE_URL` | Pages env (not Actions secret) | Public origin for Cloudflare Pages builds |

### GitHub Workflow Permissions

Ensure the sync workflow has write permissions to push matrix updates:
- **Repo Settings** -> **Actions** -> **General** -> **Workflow permissions** -> Select **Read and write permissions**.

---

## Local Development

```sh
cp .env.example .env
npm install
npm run sync     # builds data/models-matrix.json + .csv
npm run dev      # http://localhost:4321
npm test
SITE_URL=https://effiq.pages.dev npm run build
```

For a local production build that intentionally uses localhost:

```sh
ALLOW_LOCAL_SITE_URL=1 SITE_URL=http://localhost:4321 npm run build
```

### Verify production output

```sh
SITE_URL=https://effiq.pages.dev npm run build
test -f dist/robots.txt && test -f dist/sitemap.xml && test -f dist/llms.txt && test -f dist/404.html
find dist -name '*.map' | wc -l   # expect 0
npm run preview
```

Browse `/`, `/methodology/`, an unknown path (404), `/robots.txt`, `/sitemap.xml`, and `/llms.txt`.

---

## Static Endpoints

| Endpoint | Output | Purpose |
|----------|--------|---------|
| `GET /api/models.json` | Static JSON file | Canonical model matrix consumed by the frontend and available for download |
| `GET /api/models.csv` | Static CSV file | Matrix export for spreadsheet tools |
| `GET /api/health` | Static JSON file | Build-time matrix age and manifest status |
| `GET /robots.txt` | Plain text | Crawl rules + sitemap pointer (built from `SITE_URL`) |
| `GET /sitemap.xml` | XML | Canonical public URLs |
| `GET /llms.txt` | Plain text | Machine-readable site summary for LLM agents |
| `GET /404` | HTML | Branded not-found page (`dist/404.html` for Pages) |
