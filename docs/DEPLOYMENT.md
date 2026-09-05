# Deployment — effiq

## Architecture

**effiq** is deployed as a **100% static site on Cloudflare Pages**. There is no backend process running at request time:
- **Build time:** Astro compiles static HTML and exports `data/models-matrix.json` and `data/models-matrix.csv` into `dist/api/`.
- **Browser:** The React frontend fetches `/api/models.json` once, then executes 100% of the filtering, dynamic weight sliders, Pareto frontier calculations, and ranking client-side.
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
4. **Environment variables / secrets:** Leave blank. No API keys or secrets are needed on Cloudflare Pages.

---

## Periodic Sync & GitHub Actions Secrets

Periodic updates are handled by GitHub Actions (`.github/workflows/sync.yml`).

### Configuring Secrets in GitHub

Go to **Repo Settings** -> **Secrets and variables** -> **Actions**:

| Secret / Variable | Type | Purpose |
|-------------------|------|---------|
| `ARTIFICIAL_ANALYSIS_API_KEY` | Secret | Optional / future live AA sync |
| `CURSOR_API_KEY` | Secret | Optional / regenerate Cursor models |
| `HF_TOKEN` | Secret | Optional Hugging Face token |
| `AA_CATALOG_PATH` | Variable | Override path to AA catalog JSON (defaults to `data/aa-catalog.json`) |
| `CURSOR_MODELS_CSV` | Variable | Override path to Cursor CSV (defaults to `data/cursor-models.csv`) |

### GitHub Workflow Permissions

Ensure the workflow has write permissions to push matrix updates:
- **Repo Settings** -> **Actions** -> **General** -> **Workflow permissions** -> Select **Read and write permissions**.

---

## Local Development

```sh
cp .env.example .env
npm install
npm run sync     # builds data/models-matrix.json + .csv
npm run dev      # http://localhost:4321
npm test
npm run build
```

---

## Static Endpoints

| Endpoint | Output | Purpose |
|----------|--------|---------|
| `GET /api/models.json` | Static JSON file | Canonical model matrix consumed by the frontend and available for download |
| `GET /api/models.csv` | Static CSV file | Matrix export for spreadsheet tools |
| `GET /api/health` | Static JSON file | Build-time matrix age and manifest status |
