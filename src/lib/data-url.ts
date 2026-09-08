/**
 * Where the models matrix is served from.
 *
 * PUBLIC_MATRIX_URL (set at build time) points at the generated
 * models-matrix.json on the public S3/R2 bucket. When unset the site falls
 * back to its own prerendered /api/models.json, which is baked from local
 * data/ at build time.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const MATRIX_JSON_URL = env.PUBLIC_MATRIX_URL ?? "/api/models.json";

export const MATRIX_CSV_URL =
  env.PUBLIC_MATRIX_CSV_URL ?? MATRIX_JSON_URL.replace(/models-matrix\.json$/, "models-matrix.csv");

/** Resolve a possibly-absolute matrix URL against the site origin for SEO surfaces. */
export function absoluteMatrixUrl(site: string, url: string): string {
  return url.startsWith("http") ? url : `${site.replace(/\/$/, "")}${url}`;
}
