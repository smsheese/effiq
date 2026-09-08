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
  | "claude_subscription"
  | "chatgpt_subscription"
  | "cursor_subscription"
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
  | "cursorbench"
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
  channel: "openrouter" | "cursor" | "opencode" | "direct" | "other";
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
    cursorBench?: SourcedNumber | null;
    cursorBenchCostUsd?: SourcedNumber | null;
    cursorBenchTokens?: SourcedNumber | null;
    cursorBenchSteps?: SourcedNumber | null;
    taskCostUsd: SourcedNumber | null;
    aaTotalCostUsd: SourcedNumber | null;
    throughputTps: SourcedNumber | null;
    ttftSeconds: SourcedNumber | null;
    latencyMs: SourcedNumber | null;
    taskTimeSeconds: SourcedNumber | null;
    taskTokens: SourcedNumber | null;
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
    cursorBench?: { min: number; max: number };
    taskCostUsd: { min: number; max: number };
    throughputTps: { min: number; max: number };
    latencyMs: { min: number; max: number };
    taskTimeSeconds?: { min: number; max: number };
    taskTokens?: { min: number; max: number };
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

/**
 * Flat-fee coding subscription plans (Claude Pro/Max, ChatGPT Plus/Pro).
 * Prices are measured (published list prices); usage quotas are estimated
 * because vendors state them as prose ("5x Pro", "expanded Codex") with no
 * machine-readable quota API. Kept separate from per-token ProviderOffer
 * scoring — see the /subscriptions/ comparison page.
 */

export type SubscriptionBucket = "upto-20" | "upto-50" | "upto-100" | "over-100";

export type SubscriptionSource =
  | "claude_subscription"
  | "chatgpt_subscription"
  | "cursor_subscription"
  | "openrouter"
  | "opencode";

/**
 * Included-consumption estimate in the plan's native unit. Vendors never
 * share a unit: Claude caps weekly hours, Cursor caps monthly API-dollar
 * pools, ChatGPT caps messages per 5h window. The advisor judges each plan
 * in its own unit — no fake cross-unit conversions.
 */
export type CapacityUnit = "weekly_hours" | "monthly_usd" | "session_messages";

export type CapacityBasis = "official" | "community" | "derived";

export interface PlanCapacity {
  unit: CapacityUnit;
  low: number;
  high: number;
  basis: CapacityBasis;
  /** Short label of what the numbers mean, e.g. "Sonnet-equiv hrs/wk". */
  ref: string;
  note?: string | null;
}

/**
 * Whether the subscription auth works outside the vendor's own harness.
 * Harness lock-in (or ban risk in third-party tools) is the biggest plan
 * factor after monthly cost and intelligence.
 */
export type PortabilityLevel = "open" | "vendor_tools_only" | "harness_locked";

export interface PlanPortability {
  level: PortabilityLevel;
  /** Tools the subscription officially works with. */
  tools: string;
  /** Ban/ToS caveat shown in the UI; null when none known. */
  riskNote: string | null;
}

export interface SubscriptionPlan {
  id: string;
  provider: "Claude" | "ChatGPT" | "Cursor" | "OpenRouter" | "OpenCode Go";
  name: string;
  monthlyUsd: number;
  annualUsdPerMo: number | null;
  bucket: SubscriptionBucket;
  source: SubscriptionSource;
  sourceUrl: string;
  observedAt: string;
  includesClaudeCode: boolean;
  codexAccess: "none" | "limited" | "expanded" | "maximum";
  /** Override for the coding-access cell (e.g. Cursor Agent + Tab). */
  accessLabel?: string | null;
  /** Matrix familySlugs usable on this plan, smartest first. */
  modelFamilies: string[];
  /** Families spanning cheap→pricey burn for Cursor pool math. Defaults to modelFamilies. */
  burnFamilies?: string[] | null;
  /**
   * Prefer per-token tariffs from this channel's offers (e.g. Zen prices for
   * OpenCode Go) instead of merged metric tariffs when pricing burn.
   */
  tariffChannel?: "openrouter" | "cursor" | "opencode" | null;
  /** Included consumption in the plan's native unit (see PlanCapacity). */
  capacity: PlanCapacity;
  /** Where the subscription auth can be used (third-party harnesses vs vendor tools only). */
  portability: PlanPortability;
  usageWindow5h: string | null;
  weeklyLimit: string | null;
  overageCredits: boolean;
  priceStatus: "measured" | "estimated";
  quotaStatus: "estimated";
  notes: string | null;
}

export interface SubscriptionCatalog {
  observedAt: string;
  plans: SubscriptionPlan[];
}

export function subscriptionBucketForPrice(monthlyUsd: number): SubscriptionBucket {
  if (monthlyUsd <= 20) return "upto-20";
  if (monthlyUsd <= 50) return "upto-50";
  if (monthlyUsd <= 100) return "upto-100";
  return "over-100";
}

/** Effective flat-fee cost per task at a given monthly task volume. */
export function subscriptionCostPerTask(monthlyUsd: number, tasksPerMonth: number): number | null {
  if (!Number.isFinite(monthlyUsd) || !Number.isFinite(tasksPerMonth) || tasksPerMonth <= 0) return null;
  return monthlyUsd / tasksPerMonth;
}
