/**
 * Usage profiles: domain evidence mix, default weights, and workload templates.
 */

import type { MetricWeights, UsageProfile, UsageProfileId, WorkloadTemplate } from "./schema";

export const DEFAULT_EFFICIENCY_WEIGHTS: MetricWeights = {
  intelligence: 35,
  coding: 15,
  agentic: 10,
  task_cost: 30,
  latency: 5,
  throughput: 5,
};

export const WEIGHT_PRESETS: Record<string, { label: string; weights: MetricWeights }> = {
  max_efficiency: {
    label: "Max efficiency",
    weights: { intelligence: 30, coding: 10, agentic: 5, task_cost: 45, latency: 5, throughput: 5 },
  },
  coding_agent: {
    label: "Coding agent",
    weights: { intelligence: 20, coding: 35, agentic: 20, task_cost: 20, latency: 3, throughput: 2 },
  },
  budget_swarm: {
    label: "Budget swarm",
    weights: { intelligence: 20, coding: 10, agentic: 5, task_cost: 50, latency: 5, throughput: 10 },
  },
  peak_capability: {
    label: "Peak capability",
    weights: { intelligence: 40, coding: 25, agentic: 20, task_cost: 10, latency: 3, throughput: 2 },
  },
  speed: {
    label: "Speed",
    weights: { intelligence: 20, coding: 10, agentic: 5, task_cost: 15, latency: 25, throughput: 25 },
  },
};

const workloads = {
  general: {
    id: "general",
    label: "Standard mixed task",
    inputTokens: 4000,
    outputTokens: 800,
    reasoningTokens: 2000,
    cacheReadTokens: 1000,
    repeatedCalls: 1,
    notes: "Balanced chat + light reasoning.",
  },
  coding: {
    id: "coding",
    label: "Coding agent loop",
    inputTokens: 12000,
    outputTokens: 1500,
    reasoningTokens: 4000,
    cacheReadTokens: 6000,
    repeatedCalls: 4,
    notes: "Repo context + tool loops.",
  },
  agents: {
    id: "agents",
    label: "Multi-step agent",
    inputTokens: 8000,
    outputTokens: 1200,
    reasoningTokens: 5000,
    cacheReadTokens: 4000,
    repeatedCalls: 6,
    notes: "Tool use across many calls.",
  },
  math: {
    id: "math",
    label: "Hard reasoning",
    inputTokens: 2000,
    outputTokens: 600,
    reasoningTokens: 8000,
    cacheReadTokens: 0,
    repeatedCalls: 1,
    notes: "Heavy reasoning tokens.",
  },
  finance: {
    id: "finance",
    label: "Document analysis",
    inputTokens: 20000,
    outputTokens: 1000,
    reasoningTokens: 3000,
    cacheReadTokens: 8000,
    repeatedCalls: 2,
    notes: "Long docs + structured extraction.",
  },
  research: {
    id: "research",
    label: "Long-context research",
    inputTokens: 40000,
    outputTokens: 2000,
    reasoningTokens: 4000,
    cacheReadTokens: 20000,
    repeatedCalls: 3,
    notes: "Retrieval + synthesis.",
  },
  writing: {
    id: "writing",
    label: "Long-form writing",
    inputTokens: 3000,
    outputTokens: 4000,
    reasoningTokens: 1000,
    cacheReadTokens: 500,
    repeatedCalls: 1,
    notes: "Generation-heavy.",
  },
  multimodal: {
    id: "multimodal",
    label: "Vision + text",
    inputTokens: 6000,
    outputTokens: 1000,
    reasoningTokens: 2000,
    cacheReadTokens: 1000,
    repeatedCalls: 1,
    notes: "Image/audio understanding + reply.",
  },
} as const satisfies Record<string, WorkloadTemplate>;

export const USAGE_PROFILES: UsageProfile[] = [
  {
    id: "general",
    label: "General",
    description: "Broad capability with balanced cost.",
    defaultWeights: DEFAULT_EFFICIENCY_WEIGHTS,
    domainWeights: { intelligence: 0.5, coding: 0.25, agentic: 0.15, elo: 0.1 },
    workload: workloads.general,
  },
  {
    id: "coding",
    label: "Coding",
    description: "SWE/coding strength and agent loops.",
    defaultWeights: WEIGHT_PRESETS.coding_agent.weights,
    domainWeights: { coding: 0.55, agentic: 0.25, intelligence: 0.2 },
    workload: workloads.coding,
    hardRequirements: { minCoding: 30 },
  },
  {
    id: "agents",
    label: "Agents",
    description: "Tool use, multi-step reliability, cache.",
    defaultWeights: { intelligence: 20, coding: 15, agentic: 35, task_cost: 20, latency: 5, throughput: 5 },
    domainWeights: { agentic: 0.55, intelligence: 0.25, coding: 0.2 },
    workload: workloads.agents,
    hardRequirements: { minAgentic: 25 },
  },
  {
    id: "math_science",
    label: "Math & Science",
    description: "Hard reasoning and science QA.",
    defaultWeights: { intelligence: 45, coding: 10, agentic: 5, task_cost: 25, latency: 10, throughput: 5 },
    domainWeights: { intelligence: 0.7, coding: 0.15, agentic: 0.15 },
    workload: workloads.math,
  },
  {
    id: "finance",
    label: "Finance",
    description: "Numeric reasoning and document extraction.",
    defaultWeights: { intelligence: 35, coding: 10, agentic: 15, task_cost: 30, latency: 5, throughput: 5 },
    domainWeights: { intelligence: 0.45, agentic: 0.25, coding: 0.2, elo: 0.1 },
    workload: workloads.finance,
  },
  {
    id: "research",
    label: "Research",
    description: "Long context, retrieval, synthesis.",
    defaultWeights: { intelligence: 40, coding: 5, agentic: 20, task_cost: 25, latency: 5, throughput: 5 },
    domainWeights: { intelligence: 0.5, agentic: 0.3, elo: 0.1, coding: 0.1 },
    workload: workloads.research,
  },
  {
    id: "writing",
    label: "Writing & Literature",
    description: "Style, instruction following, long output.",
    defaultWeights: { intelligence: 30, coding: 5, agentic: 5, task_cost: 35, latency: 10, throughput: 15 },
    domainWeights: { elo: 0.4, intelligence: 0.45, agentic: 0.15 },
    workload: workloads.writing,
  },
  {
    id: "multimodal",
    label: "Multimodal",
    description: "Image/audio/video + text.",
    defaultWeights: { intelligence: 30, coding: 10, agentic: 15, task_cost: 30, latency: 10, throughput: 5 },
    domainWeights: { intelligence: 0.45, agentic: 0.25, coding: 0.15, elo: 0.15 },
    workload: workloads.multimodal,
    hardRequirements: { requireImageInput: true },
  },
];

export function getProfile(id: UsageProfileId): UsageProfile {
  return USAGE_PROFILES.find((p) => p.id === id) ?? USAGE_PROFILES[0];
}

export function normalizeWeights(w: MetricWeights): MetricWeights {
  const sum =
    w.intelligence + w.coding + w.agentic + w.task_cost + w.latency + w.throughput;
  if (sum <= 0) return { ...DEFAULT_EFFICIENCY_WEIGHTS };
  const scale = 100 / sum;
  return {
    intelligence: w.intelligence * scale,
    coding: w.coding * scale,
    agentic: w.agentic * scale,
    task_cost: w.task_cost * scale,
    latency: w.latency * scale,
    throughput: w.throughput * scale,
  };
}
