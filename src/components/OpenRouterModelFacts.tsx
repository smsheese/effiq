"use client";

import * as React from "react";
import type { ModelVariant } from "@/lib/schema";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Loader2, Server, Database, AlertCircle } from "lucide-react";

interface OpenRouterEndpoint {
  name?: string;
  provider_name?: string;
  context_length?: number;
  quantization?: string;
  pricing?: {
    prompt?: string;
    completion?: string;
    input_cache_read?: string;
    input_cache_write?: string;
    request?: string;
    discount?: number;
  };
  max_completion_tokens?: number;
  uptime_last_1d?: number;
  latency_last_30m?: number | null;
  throughput_last_30m?: number | null;
  status?: number;
}

interface OpenRouterModelData {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  architecture?: {
    tokenizer?: string;
    modality?: string;
    instruct_type?: string | null;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  endpoints?: OpenRouterEndpoint[];
}

// In-memory client cache so clicking around doesn't repeatedly re-fetch
const factsCache = new Map<string, { data: OpenRouterModelData | null; error: string | null }>();

interface Props {
  variant: ModelVariant;
}

function fmtPrice(valStr: string | undefined | null, multiplier = 1e6): string {
  if (!valStr) return "—";
  const num = parseFloat(valStr);
  if (!Number.isFinite(num)) return "—";
  const perM = num * multiplier;
  if (perM === 0) return "$0";
  if (perM < 0.01) return `$${perM.toFixed(4)}`;
  if (perM < 1) return `$${perM.toFixed(3)}`;
  return `$${perM.toFixed(2)}`;
}

export function OpenRouterModelFacts({ variant }: Props) {
  const slug = variant.ids.openrouterSlug || variant.ids.openrouterPermaslug;
  const [loading, setLoading] = React.useState(!factsCache.has(slug ?? ""));
  const [data, setData] = React.useState<OpenRouterModelData | null>(
    slug ? factsCache.get(slug)?.data ?? null : null,
  );
  const [error, setError] = React.useState<string | null>(
    slug ? factsCache.get(slug)?.error ?? null : null,
  );
  const [showAllDesc, setShowAllDesc] = React.useState(false);

  React.useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }

    if (factsCache.has(slug)) {
      const cached = factsCache.get(slug)!;
      setData(cached.data);
      setError(cached.error);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    // Clean up slug if needed (e.g. remove trailing tags)
    const cleanSlug = slug.replace(/:(free|extended|exact)$/, "");

    fetch(`https://openrouter.ai/api/v1/models/${cleanSlug}/endpoints`, {
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`OpenRouter returned status ${res.status}`);
        }
        const json = (await res.json()) as { data?: OpenRouterModelData };
        if (!cancelled) {
          const modelData = json.data ?? null;
          factsCache.set(slug, { data: modelData, error: null });
          setData(modelData);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = (err as Error).message || "Failed to load OpenRouter endpoints";
          factsCache.set(slug, { data: null, error: msg });
          setError(msg);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const endpoints = data?.endpoints ?? [];
  const hasLiveEndpoints = endpoints.length > 0;
  const fallbackOffers = variant.offers;

  return (
    <div className="space-y-3 rounded-lg border bg-card/60 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
        <div className="flex items-center gap-2">
          <Server className="size-4 text-primary" />
          <span className="font-semibold text-sm">OpenRouter Model Facts & Providers</span>
          {slug && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {slug}
            </Badge>
          )}
        </div>
        {slug && (
          <a
            href={`https://openrouter.ai/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2"
          >
            <span>View on OpenRouter</span>
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground justify-center">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>Lazy loading OpenRouter facts, providers & live pricing…</span>
        </div>
      )}

      {!loading && !slug && (
        <div className="text-xs text-muted-foreground py-2">
          No OpenRouter slug associated with this variant. Showing local matrix offers below.
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-1.5 rounded border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>{error} — showing cached matrix offers below.</span>
        </div>
      )}

      {!loading && data && (
        <div className="space-y-2">
          {/* Architecture & context specs */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {data.context_length != null && (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                <Database className="size-3 text-muted-foreground" />
                <span>Context: {(data.context_length / 1000).toFixed(0)}k</span>
              </span>
            )}
            {data.architecture?.modality && (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                <span>Modality: {data.architecture.modality}</span>
              </span>
            )}
            {data.architecture?.tokenizer && (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                <span>Tokenizer: {data.architecture.tokenizer}</span>
              </span>
            )}
            {data.architecture?.input_modalities && data.architecture.input_modalities.length > 0 && (
              <span className="rounded bg-muted px-2 py-0.5 text-[11px]">
                Inputs: {data.architecture.input_modalities.join(", ")}
              </span>
            )}
          </div>

          {/* Model Description */}
          {data.description && (
            <div className="text-xs text-muted-foreground leading-relaxed">
              <p className={showAllDesc ? "" : "line-clamp-2"}>{data.description}</p>
              {data.description.length > 140 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAllDesc(!showAllDesc);
                  }}
                  className="mt-0.5 text-[11px] text-primary hover:underline"
                >
                  {showAllDesc ? "Show less" : "Show full description"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Providers & Pricing */}
      {!loading && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs font-medium text-foreground">
            <span>
              Providers & Pricing ({hasLiveEndpoints ? endpoints.length : fallbackOffers.length} available)
            </span>
            {hasLiveEndpoints && (
              <span className="text-[10px] text-muted-foreground">Live from OpenRouter API</span>
            )}
          </div>

          {hasLiveEndpoints ? (
            <div className="max-h-60 overflow-y-auto rounded border bg-background/50">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted/80 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
                  <tr>
                    <th className="px-2.5 py-1.5">Provider</th>
                    <th className="px-2.5 py-1.5 text-right">Input / 1M</th>
                    <th className="px-2.5 py-1.5 text-right">Output / 1M</th>
                    <th className="px-2.5 py-1.5 text-right">Cache Read / 1M</th>
                    <th className="px-2.5 py-1.5 text-center">Quant</th>
                    <th className="px-2.5 py-1.5 text-right">Context</th>
                    <th className="px-2.5 py-1.5 text-right">Uptime</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono text-[11px]">
                  {endpoints.map((ep, idx) => (
                    <tr key={`${ep.provider_name}-${idx}`} className="hover:bg-muted/40 transition-colors">
                      <td className="px-2.5 py-1.5 font-sans font-medium text-foreground">
                        {ep.provider_name || ep.name || "Unknown Provider"}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-emerald-600 dark:text-emerald-400">
                        {fmtPrice(ep.pricing?.prompt)}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-sky-600 dark:text-sky-400">
                        {fmtPrice(ep.pricing?.completion)}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-muted-foreground">
                        {ep.pricing?.input_cache_read ? fmtPrice(ep.pricing.input_cache_read) : "—"}
                      </td>
                      <td className="px-2.5 py-1.5 text-center font-sans">
                        {ep.quantization && ep.quantization !== "unknown" ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                            {ep.quantization}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-muted-foreground">
                        {ep.context_length ? `${Math.round(ep.context_length / 1000)}k` : "—"}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-muted-foreground">
                        {ep.uptime_last_1d != null ? `${ep.uptime_last_1d.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : fallbackOffers.length > 0 ? (
            <div className="max-h-52 overflow-y-auto rounded border bg-background/50">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted/80 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
                  <tr>
                    <th className="px-2.5 py-1.5">Provider</th>
                    <th className="px-2.5 py-1.5">Channel</th>
                    <th className="px-2.5 py-1.5 text-right">Input / 1M</th>
                    <th className="px-2.5 py-1.5 text-right">Output / 1M</th>
                    <th className="px-2.5 py-1.5 text-right">TPS</th>
                    <th className="px-2.5 py-1.5 text-right">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono text-[11px]">
                  {fallbackOffers.map((o) => (
                    <tr key={o.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-2.5 py-1.5 font-sans font-medium">{o.provider}</td>
                      <td className="px-2.5 py-1.5 font-sans text-muted-foreground text-[10px] uppercase">
                        {o.channel}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-emerald-600 dark:text-emerald-400">
                        {o.inputUsdPerMillion != null ? `$${o.inputUsdPerMillion.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-sky-600 dark:text-sky-400">
                        {o.outputUsdPerMillion != null ? `$${o.outputUsdPerMillion.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-muted-foreground">
                        {o.throughputTps != null ? `${Math.round(o.throughputTps)}` : "—"}
                      </td>
                      <td className="px-2.5 py-1.5 text-right text-muted-foreground">
                        {o.latencyMs != null ? `${Math.round(o.latencyMs)}ms` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
              No provider pricing offers available for this variant.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
