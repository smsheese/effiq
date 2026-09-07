/**
 * Build-time server-rendered snapshot of the default ranking.
 * Reads the canonical matrix from disk so the static HTML ships a crawlable
 * top-10 table, headline stats, and the matrix timestamp without client JS.
 */
import { readFileSync } from "node:fs";
import {
  DEFAULT_INTELLIGENCE_FLOOR,
  scoreVariants,
  type RankingOptions,
} from "@/lib/scoring";
import { DEFAULT_EFFICIENCY_WEIGHTS } from "@/lib/profiles";
import type { ModelsMatrix, ScoredVariant } from "@/lib/schema";

const MATRIX_PATH = "data/models-matrix.json";
export const TOP_PICKS_LIMIT = 10;

const DEFAULT_OPTIONS: RankingOptions = {
  profileId: "general",
  weights: DEFAULT_EFFICIENCY_WEIGHTS,
  intelligenceFloor: DEFAULT_INTELLIGENCE_FLOOR,
  includeApproximations: true,
  minConfidence: 0.3,
  conservativeRanking: true,
  channel: "all",
};

export interface TopPicksSnapshot {
  generatedAt: string;
  variantCount: number;
  rankedCount: number;
  rows: Array<{
    rank: number;
    name: string;
    effort: string;
    provider: string;
    efficiencyScore: number | null;
    intelligence: number | null;
    taskCostUsd: number | null;
    inputUsdPerMillion: number | null;
    outputUsdPerMillion: number | null;
  }>;
  leaders: {
    best: { name: string; score: number | null } | null;
    cheapest: { name: string; taskCostUsd: number | null } | null;
    smartest: { name: string; intelligence: number | null } | null;
  };
}

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n === 0) return "$0";
  if (n < 0.001) return `$${n.toFixed(5).replace(/0+$/, "")}`;
  if (n < 1) return `$${n.toFixed(3).replace(/0+$/, "")}`;
  return `$${n.toFixed(2)}`;
}

export function formatMoney(n: number | null): string {
  return fmtMoney(n);
}

export function loadMatrix(): ModelsMatrix {
  return JSON.parse(readFileSync(MATRIX_PATH, "utf8")) as ModelsMatrix;
}

export function buildTopPicks(
  matrix: ModelsMatrix,
  options: RankingOptions = DEFAULT_OPTIONS,
): TopPicksSnapshot {
  const scored = scoreVariants(matrix.variants, options).filter(
    (s) => s.efficiencyScore != null,
  );
  scored.sort((a, b) => (b.efficiencyScore ?? 0) - (a.efficiencyScore ?? 0));

  const rows = scored.slice(0, TOP_PICKS_LIMIT).map((s: ScoredVariant, i) => ({
    rank: i + 1,
    name: s.variant.displayName,
    effort: s.variant.effort,
    provider: s.variant.provider,
    efficiencyScore: s.efficiencyScore,
    intelligence: s.intelligenceForGate,
    taskCostUsd: s.effectiveTaskCostUsd,
    inputUsdPerMillion: s.variant.metrics.inputUsdPerMillion?.value ?? null,
    outputUsdPerMillion: s.variant.metrics.outputUsdPerMillion?.value ?? null,
  }));

  const cheapest = [...scored]
    .filter((s) => s.effectiveTaskCostUsd != null)
    .sort(
      (a, b) => (a.effectiveTaskCostUsd ?? Infinity) - (b.effectiveTaskCostUsd ?? Infinity),
    )[0];

  const smartest = [...scored]
    .filter((s) => s.intelligenceForGate != null)
    .sort((a, b) => (b.intelligenceForGate ?? 0) - (a.intelligenceForGate ?? 0))[0];

  return {
    generatedAt: matrix.generatedAt,
    variantCount: matrix.variants.length,
    rankedCount: scored.length,
    rows,
    leaders: {
      best: rows[0]
        ? { name: rows[0].name, score: rows[0].efficiencyScore }
        : null,
      cheapest: cheapest
        ? { name: cheapest.variant.displayName, taskCostUsd: cheapest.effectiveTaskCostUsd }
        : null,
      smartest: smartest
        ? { name: smartest.variant.displayName, intelligence: smartest.intelligenceForGate }
        : null,
    },
  };
}

export function getTopPicks(): TopPicksSnapshot {
  return buildTopPicks(loadMatrix());
}
