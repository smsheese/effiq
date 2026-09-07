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

export interface CursorBenchItem {
  rank: number;
  model: string;
  familySlug: string;
  effort: string;
  score: number;
  costUsd: number;
  tokens: number;
  steps: number;
}

export interface CursorBenchCatalog {
  benchmark: string;
  url: string;
  observedAt: string;
  description: string;
  results: CursorBenchItem[];
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
          taskTimeSeconds: null,
          taskTokens: null,
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

function matchBenchItem(v: ModelVariant, item: CursorBenchItem): boolean {
  if (v.familySlug !== item.familySlug) {
    // Check if canonicalId or aliases match
    if (!v.canonicalId.includes(item.familySlug) && !v.displayName.toLowerCase().includes(item.familySlug)) {
      return false;
    }
  }

  // Handle composer-2-5 or kimi-k2-7-code where effort in bench is none/standard
  if (item.familySlug === "composer-2-5" || item.familySlug === "kimi-k2-7-code") {
    return true;
  }

  const vEffort = v.effort;
  if (vEffort === item.effort) return true;

  // Try parsing effort from display name if variant effort is unknown
  if (vEffort === "unknown") {
    const parsed = parseEffortFromText(v.displayName);
    if (parsed === item.effort) return true;
  }

  return false;
}

export function attachCursorBench(
  variants: ModelVariant[],
  catalog: CursorBenchCatalog,
): ModelVariant[] {
  return variants.map((v) => {
    const item = catalog.results.find((r) => matchBenchItem(v, r));
    if (!item) return v;

    const benchScore: SourcedNumber = {
      value: item.score,
      unit: "percent_0_100",
      source: "cursor",
      observedAt: catalog.observedAt,
      confidence: 0.95,
      status: "measured",
      method: "cursorbench_3_2",
      notes: `${catalog.benchmark} #${item.rank} (${item.steps} steps/task)`,
    };

    const benchCost: SourcedNumber = {
      value: item.costUsd,
      unit: "usd_per_task",
      source: "cursor",
      observedAt: catalog.observedAt,
      confidence: 0.95,
      status: "measured",
      method: "cursorbench_3_2",
      notes: `Measured average cost per task on ${catalog.benchmark}`,
    };

    const benchTokens: SourcedNumber = {
      value: item.tokens,
      unit: "tokens",
      source: "cursor",
      observedAt: catalog.observedAt,
      confidence: 0.95,
      status: "measured",
      method: "cursorbench_3_2",
      notes: `Measured average tokens per task on ${catalog.benchmark}`,
    };

    const benchSteps: SourcedNumber = {
      value: item.steps,
      unit: "steps",
      source: "cursor",
      observedAt: catalog.observedAt,
      confidence: 0.95,
      status: "measured",
      method: "cursorbench_3_2",
    };

    const metrics = { ...v.metrics };
    metrics.cursorBench = benchScore;
    metrics.cursorBenchCostUsd = benchCost;
    metrics.cursorBenchTokens = benchTokens;
    metrics.cursorBenchSteps = benchSteps;

    // Use measured CursorBench cost if taskCostUsd is missing or not measured
    if (!metrics.taskCostUsd || metrics.taskCostUsd.status !== "measured") {
      metrics.taskCostUsd = benchCost;
    }

    // Use measured CursorBench tokens if taskTokens is missing or not measured
    if (!metrics.taskTokens || metrics.taskTokens.status !== "measured") {
      metrics.taskTokens = benchTokens;
    }

    // If coding is missing or not measured, anchor with CursorBench measured score
    if (!metrics.coding || metrics.coding.status !== "measured") {
      metrics.coding = {
        value: item.score,
        unit: "index_0_100",
        source: "cursor",
        observedAt: catalog.observedAt,
        confidence: 0.95,
        status: "measured",
        method: "cursorbench_3_2",
        notes: `Benchmarked via ${catalog.benchmark}`,
      };
    }

    const hasBenchProvenance = v.provenance.some(
      (p) => p.pathOrUrl === catalog.url || p.version === catalog.benchmark,
    );
    const provenance = hasBenchProvenance
      ? v.provenance
      : [
          ...v.provenance,
          {
            source: "cursor" as const,
            pathOrUrl: catalog.url,
            pulledAt: catalog.observedAt,
            version: catalog.benchmark,
          },
        ];

    return {
      ...v,
      metrics,
      provenance,
      evidenceCoverage: Math.max(v.evidenceCoverage, 0.6),
    };
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
