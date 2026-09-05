import type { EffortLevel, ModelVariant, ProviderOffer, SourcedNumber } from "../schema";
import {
  canonicalVariantId,
  familySlugFromName,
  normalizeSlug,
  parseEffortFromText,
  parseFast,
} from "../identity";

export interface CursorCsvRow {
  model_id: string;
  display_name: string;
  aliases?: string;
  provider?: string;
  usage_pool?: string;
  task_slug: string;
  fast_mode?: string;
  thinking_mode?: string;
  effort?: string;
  reasoning?: string;
  context_window?: string;
  price_input_usd_per_million?: string;
  price_output_usd_per_million?: string;
  price_cache_read_usd_per_million?: string;
  price_cache_write_usd_per_million?: string;
}

function parseNum(s: string | undefined): number | null {
  if (s == null || s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function sn(
  value: number | null,
  unit: string,
  observedAt: string,
): SourcedNumber | null {
  if (value == null) return null;
  return {
    value,
    unit,
    source: "cursor",
    observedAt,
    confidence: 0.9,
    status: "measured",
    method: "cursor_models_csv",
  };
}

export function adaptCursor(rows: CursorCsvRow[], observedAt: string): ModelVariant[] {
  return rows
    .filter((r) => r.model_id && r.model_id !== "default")
    .map((r) => {
      const effortRaw = r.effort || r.reasoning || "";
      const effort = (parseEffortFromText(effortRaw || r.task_slug) || "unknown") as EffortLevel;
      const thinking =
        r.thinking_mode === "True" || r.thinking_mode === "true"
          ? true
          : r.thinking_mode === "False" || r.thinking_mode === "false"
            ? false
            : null;
      const fast = r.fast_mode === "True" || r.fast_mode === "true" || parseFast(r.task_slug);
      const familySlug = familySlugFromName(r.display_name, r.model_id);
      const inP = parseNum(r.price_input_usd_per_million);
      const outP = parseNum(r.price_output_usd_per_million);

      const offer: ProviderOffer = {
        id: `cursor:${r.task_slug}`,
        provider: "Cursor",
        providerSlug: "cursor",
        channel: "cursor",
        variant: r.task_slug,
        quantization: null,
        isFree: false,
        zdr: false,
        contextLength: parseNum(r.context_window),
        inputUsdPerMillion: inP,
        outputUsdPerMillion: outP,
        cacheReadUsdPerMillion: parseNum(r.price_cache_read_usd_per_million),
        cacheWriteUsdPerMillion: parseNum(r.price_cache_write_usd_per_million),
        throughputTps: null,
        latencyMs: null,
        url: null,
      };

      return {
        canonicalId: canonicalVariantId({
          familySlug,
          effort: effort === "unknown" && !effortRaw ? "medium" : effort,
          thinking,
          fast,
          channel: "cursor",
        }),
        familySlug,
        displayName: `${r.display_name}${effortRaw ? ` (${effortRaw})` : ""}${fast ? " fast" : ""}`,
        provider: r.provider || "Cursor",
        effort: effort === "unknown" && !effortRaw ? "medium" : effort,
        thinking,
        fast,
        reasoningMode: thinking ? "adaptive" : effort === "none" ? "none" : "reasoning",
        contextWindow: parseNum(r.context_window),
        modalities: { input: ["text"], output: ["text"] },
        supportsReasoning: effort !== "none",
        ids: {
          cursorModelId: r.model_id,
          cursorTaskSlug: r.task_slug,
          aliases: [
            normalizeSlug(r.model_id),
            normalizeSlug(r.task_slug),
            ...(r.aliases ? r.aliases.split("|").map(normalizeSlug) : []),
          ],
        },
        metrics: {
          intelligence: null,
          coding: null,
          agentic: null,
          elo: null,
          taskCostUsd: null,
          aaTotalCostUsd: null,
          throughputTps: null,
          ttftSeconds: null,
          latencyMs: null,
          inputUsdPerMillion: sn(inP, "usd_per_million_tokens", observedAt),
          outputUsdPerMillion: sn(outP, "usd_per_million_tokens", observedAt),
          cacheReadUsdPerMillion: sn(
            parseNum(r.price_cache_read_usd_per_million),
            "usd_per_million_tokens",
            observedAt,
          ),
          cacheWriteUsdPerMillion: sn(
            parseNum(r.price_cache_write_usd_per_million),
            "usd_per_million_tokens",
            observedAt,
          ),
          tokenHeaviness: null,
        },
        offers: [offer],
        provenance: [
          {
            source: "cursor",
            pathOrUrl: "cursor-models.csv",
            pulledAt: observedAt,
          },
        ],
        matchEdges: [],
        matchConfidence: 0.9,
        evidenceCoverage: 0,
      } satisfies ModelVariant;
    });
}

/** Simple CSV parser for Cursor export (handles quoted fields). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
