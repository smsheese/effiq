/**
 * Deterministic identity helpers for cross-source model matching.
 */

import type { EffortLevel } from "./schema";

const EFFORT_PATTERN =
  /\b(non[- ]?reasoning|reasoning|adaptive(?:\s+reasoning)?|minimal|low|medium|high|xhigh|extra[- ]?high|max)\b/gi;

export function normalizeSlug(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .trim()
    .replace(/^[^/]+\//, "") // strip author/ prefix
    .replace(/[:_]/g, "-")
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function stripEffortSuffix(slug: string): string {
  return normalizeSlug(slug)
    .replace(
      /-(non-reasoning|reasoning|adaptive|minimal|low|medium|high|xhigh|extra-high|max|fast)$/g,
      "",
    )
    .replace(
      /-(non-reasoning|reasoning|adaptive|minimal|low|medium|high|xhigh|extra-high|max|fast)$/g,
      "",
    );
}

export function parseEffortFromText(text: string | null | undefined): EffortLevel {
  if (!text) return "unknown";
  const t = text.toLowerCase();
  if (/non[- ]?reasoning/.test(t)) return "none";
  if (/\bxhigh\b|extra[- ]?high/.test(t)) return "xhigh";
  if (/\bmax\b/.test(t) && !/maximum context/.test(t)) return "max";
  if (/\bminimal\b/.test(t)) return "minimal";
  if (/\blow\b/.test(t)) return "low";
  if (/\bmedium\b/.test(t)) return "medium";
  if (/\bhigh\b/.test(t)) return "high";
  if (/\breasoning\b/.test(t) && !/adaptive/.test(t)) return "medium";
  return "unknown";
}

export function parseThinking(text: string | null | undefined): boolean | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/thinking|adaptive/.test(t)) return true;
  if (/non[- ]?reasoning/.test(t)) return false;
  return null;
}

export function parseFast(text: string | null | undefined): boolean {
  if (!text) return false;
  return /\bfast\b/.test(text.toLowerCase());
}

export function familySlugFromName(name: string, slug?: string): string {
  const base = stripEffortSuffix(normalizeSlug(slug || name));
  // AA sometimes uses short slug for max variant
  return base || normalizeSlug(name.replace(EFFORT_PATTERN, "").trim());
}

export function displayVariantLabel(name: string, effort: EffortLevel, fast: boolean): string {
  const clean = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const parts: string[] = [clean];
  if (effort !== "unknown" && effort !== "none") parts.push(effort);
  if (effort === "none") parts.push("non-reasoning");
  if (fast) parts.push("fast");
  return parts.join(" · ");
}

export function canonicalVariantId(parts: {
  familySlug: string;
  effort: EffortLevel;
  thinking: boolean | null;
  fast: boolean;
  channel?: string;
}): string {
  return [
    normalizeSlug(parts.familySlug),
    parts.effort,
    parts.thinking === true ? "thinking" : parts.thinking === false ? "nothinking" : "unkthinking",
    parts.fast ? "fast" : "std",
    parts.channel ?? "any",
  ].join("::");
}

/** Dot/hyphen equivalence for Cursor vs AA slugs. */
export function slugCandidates(raw: string): string[] {
  const n = normalizeSlug(raw);
  const dotted = n.replace(/-/g, ".");
  const hyphened = n.replace(/\./g, "-");
  return [...new Set([n, dotted, hyphened, stripEffortSuffix(n)])];
}

export function stringSimilarity(a: string, b: string): number {
  const x = normalizeSlug(a);
  const y = normalizeSlug(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const longer = x.length > y.length ? x : y;
  const shorter = x.length > y.length ? y : x;
  if (longer.includes(shorter)) return shorter.length / longer.length;
  let matches = 0;
  const set = new Set(shorter.split("-"));
  for (const tok of longer.split("-")) if (set.has(tok)) matches++;
  return matches / Math.max(set.size, longer.split("-").length);
}
