import type { ModelVariant } from "./schema";

export interface ParentInfo {
  id: string;
  label: string;
  color: string;
}

export const PARENT_CONFIGS: Record<string, ParentInfo> = {
  Anthropic: { id: "Anthropic", label: "Anthropic", color: "#f97316" }, // Warm Orange
  OpenAI: { id: "OpenAI", label: "OpenAI", color: "#10b981" }, // Emerald
  Google: { id: "Google", label: "Google", color: "#3b82f6" }, // Blue
  Meta: { id: "Meta", label: "Meta", color: "#6366f1" }, // Indigo
  DeepSeek: { id: "DeepSeek", label: "DeepSeek", color: "#06b6d4" }, // Cyan
  Mistral: { id: "Mistral", label: "Mistral", color: "#f59e0b" }, // Amber
  "Qwen / Alibaba": { id: "Qwen / Alibaba", label: "Qwen / Alibaba", color: "#8b5cf6" }, // Purple
  xAI: { id: "xAI", label: "xAI", color: "#f43f5e" }, // Rose
  Microsoft: { id: "Microsoft", label: "Microsoft", color: "#0284c7" }, // Sky
  Amazon: { id: "Amazon", label: "Amazon", color: "#eab308" }, // Yellow
  Cohere: { id: "Cohere", label: "Cohere", color: "#ec4899" }, // Pink
  Other: { id: "Other", label: "Other", color: "#94a3b8" }, // Slate
};

export function getModelParent(
  v: Pick<ModelVariant, "provider" | "familySlug" | "displayName">,
): ParentInfo {
  const p = (v.provider || "").toLowerCase();
  const f = (v.familySlug || "").toLowerCase();
  const name = (v.displayName || "").toLowerCase();

  if (p.includes("anthropic") || f.includes("claude") || name.includes("claude")) {
    return PARENT_CONFIGS.Anthropic;
  }
  if (
    p.includes("openai") ||
    f.includes("gpt") ||
    f.includes("o1") ||
    f.includes("o3") ||
    f.includes("o4") ||
    name.startsWith("gpt-") ||
    name.startsWith("o1") ||
    name.startsWith("o3")
  ) {
    return PARENT_CONFIGS.OpenAI;
  }
  if (p.includes("google") || f.includes("gemini") || name.includes("gemini")) {
    return PARENT_CONFIGS.Google;
  }
  if (p.includes("meta") || f.includes("llama") || name.includes("llama")) {
    return PARENT_CONFIGS.Meta;
  }
  if (p.includes("deepseek") || f.includes("deepseek") || name.includes("deepseek")) {
    return PARENT_CONFIGS.DeepSeek;
  }
  if (
    p.includes("mistral") ||
    f.includes("mistral") ||
    f.includes("codestral") ||
    name.includes("mistral")
  ) {
    return PARENT_CONFIGS.Mistral;
  }
  if (p.includes("alibaba") || p.includes("qwen") || f.includes("qwen") || name.includes("qwen")) {
    return PARENT_CONFIGS["Qwen / Alibaba"];
  }
  if (p.includes("xai") || p.includes("spacexai") || f.includes("grok") || name.includes("grok")) {
    return PARENT_CONFIGS.xAI;
  }
  if (p.includes("microsoft") || f.includes("phi") || name.includes("phi-")) {
    return PARENT_CONFIGS.Microsoft;
  }
  if (p.includes("amazon") || f.includes("nova") || name.includes("nova-")) {
    return PARENT_CONFIGS.Amazon;
  }
  if (p.includes("cohere") || f.includes("command") || name.includes("command-")) {
    return PARENT_CONFIGS.Cohere;
  }
  return PARENT_CONFIGS.Other;
}
