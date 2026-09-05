/**
 * Canonical schema for effiq (efficiency × IQ).
 * Measured and inferred observations are stored separately.
 */

export const SCHEMA_VERSION = 1;
export const ESTIMATOR_VERSION = "1.0.0";

export type EffortLevel =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "unknown";

export type EvidenceStatus =
  | "measured"
  | "interpolated"
  | "extrapolated"
  | "family_estimate"
  | "insufficient";

export type SourceId =
  | "artificial_analysis"
  | "openrouter"
  | "cursor"
  | "opencode"
  | "kilocode"
  | "whatllm"
  | "llm_stats"
  | "derived";

export type UsageProfileId =
  | "general"
  | "coding"
  | "agents"
  | "math_science"
  | "finance"
  | "research"
  | "writing"
  | "multimodal";

export type MetricKey =
  | "intelligence"
  | "coding"
  | "agentic"
  | "task_cost"
  | "latency"
  | "throughput"
  | "domain"
  | "elo";

export interface SourcedNumber {
  value: number;
  unit: string;
  source: SourceId;
  observedAt: string;
  confidence: number;
  status: EvidenceStatus;
  notes?: string;
  low?: number;
  high?: number;
  method?: string;
  sampleCount?: number;
  sourceVariants?: string[];
  estimatorVersion?: string;
}

export interface ProvenanceRecord {
  source: SourceId;
  pathOrUrl: string;
  pulledAt: string;
  version?: string;
}

export interface MatchEdge {
  fromSource: SourceId;
  toSource: SourceId;
  method: "exact_slug" | "exact_name" | "task_slug" | "normalized" | "fuzzy" | "manual";
  confidence: number;
}

export interface ProviderOffer {
  id: string;
  provider: string;
  providerSlug: string | null;
  channel: "openrouter" | "cursor" | "direct" | "other";
  variant: string | null;
  quantization: string | null;
  isFree: boolean;
  zdr: boolean;
  contextLength: number | null;
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  cacheReadUsdPerMillion: number | null;
  cacheWriteUsdPerMillion: number | null;
  throughputTps: number | null;
  latencyMs: number | null;
  url: string | null;
}

export interface ModelVariantIds {
  aaUuid?: string;
  aaSlug?: string;
  aaName?: string;
  cursorModelId?: string;
  cursorTaskSlug?: string;
  openrouterSlug?: string;
  openrouterPermaslug?: string;
  hfSlug?: string;
  aliases?: string[];
}

export interface ModelVariant {
  canonicalId: string;
  familySlug: string;
  displayName: string;
  provider: string;
  effort: EffortLevel;
  thinking: boolean | null;
  fast: boolean;
  reasoningMode: "none" | "reasoning" | "adaptive" | "unknown";
  contextWindow: number | null;
  modalities: { input: string[]; output: string[] };
  supportsReasoning: boolean;
  ids: ModelVariantIds;
  metrics: {
    intelligence: SourcedNumber | null;
    coding: SourcedNumber | null;
    agentic: SourcedNumber | null;
    elo: SourcedNumber | null;
    taskCostUsd: SourcedNumber | null;
    aaTotalCostUsd: SourcedNumber | null;
    throughputTps: SourcedNumber | null;
    ttftSeconds: SourcedNumber | null;
    latencyMs: SourcedNumber | null;
    inputUsdPerMillion: SourcedNumber | null;
    outputUsdPerMillion: SourcedNumber | null;
    cacheReadUsdPerMillion: SourcedNumber | null;
    cacheWriteUsdPerMillion: SourcedNumber | null;
    tokenHeaviness: SourcedNumber | null;
  };
  offers: ProviderOffer[];
  provenance: ProvenanceRecord[];
  matchEdges: MatchEdge[];
  matchConfidence: number;
  evidenceCoverage: number;
}

export interface WorkloadTemplate {
  id: string;
  label: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  repeatedCalls: number;
  notes: string;
}

export interface MetricWeights {
  intelligence: number;
  coding: number;
  agentic: number;
  task_cost: number;
  latency: number;
  throughput: number;
}

export interface UsageProfile {
  id: UsageProfileId;
  label: string;
  description: string;
  defaultWeights: MetricWeights;
  domainWeights: Partial<Record<"intelligence" | "coding" | "agentic" | "elo", number>>;
  workload: WorkloadTemplate;
  hardRequirements?: {
    requireImageInput?: boolean;
    minCoding?: number;
    minAgentic?: number;
  };
}

export interface ScoredVariant {
  variant: ModelVariant;
  domainScore: number | null;
  domainEfficiencyScore: number | null;
  efficiencyScore: number | null;
  capabilityPerDollar: number | null;
  effectiveTaskCostUsd: number | null;
  taskCostStatus: EvidenceStatus;
  intelligenceForGate: number | null;
  confidence: number;
  explanation: string[];
}

export interface SyncManifest {
  schemaVersion: number;
  estimatorVersion: string;
  generatedAt: string;
  sources: Array<{
    id: SourceId;
    status: "ok" | "stale" | "error" | "skipped";
    pulledAt: string | null;
    rowCount: number;
    error?: string;
  }>;
  variantCount: number;
  unmatched: number;
  changesFromPrevious: {
    added: number;
    removed: number;
    updated: number;
  };
}

export interface ModelsMatrix {
  schemaVersion: number;
  estimatorVersion: string;
  generatedAt: string;
  manifest: SyncManifest;
  variants: ModelVariant[];
  benchmarkRanges: {
    intelligence: { min: number; max: number };
    coding: { min: number; max: number };
    agentic: { min: number; max: number };
    elo: { min: number; max: number };
    taskCostUsd: { min: number; max: number };
    throughputTps: { min: number; max: number };
    latencyMs: { min: number; max: number };
  };
}

export const EFFORT_ORDER: EffortLevel[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export function effortRank(effort: EffortLevel): number {
  const i = EFFORT_ORDER.indexOf(effort);
  return i >= 0 ? i : -1;
}
