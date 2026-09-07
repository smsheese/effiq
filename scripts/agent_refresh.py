#!/usr/bin/env python3
"""
agent_refresh.py
----------------
LLM-agent refresh for website-sourced pricing/benchmark seeds.

Pages (not APIs) are the source of truth for:
  1. Cursor model pricing      (https://cursor.com/docs/models-and-pricing)
     -> data/cursor-models.csv  (price columns only, rows never added/deleted)
  2. OpenCode Go models/prices (https://opencode.ai/docs/go/)
     -> data/opencode-go.json   (prices merged by modelId, new models appended)

  CursorBench (https://cursor.com/cursorbench) is intentionally NOT refreshed
  here: the page is a JS app with results baked into chart SVG, so automated
  extraction confabulates rows. data/cursorbench.json stays a manual snapshot.

How it works:
  fetch page HTML -> strip to text -> ask an OpenRouter chat model
  (temperature 0, JSON-only response) to extract structured rows ->
  validate -> merge into the seed files.

Usage:
    python3 scripts/agent_refresh.py --dry-run
    python3 scripts/agent_refresh.py --only cursor,opencode
    python3 scripts/agent_refresh.py --self-test   # no network, no key needed

Env:
    OPENROUTER_API_KEY   Required for live refresh. When unset the script
                         exits 0 with a warning so CI keeps working on the
                         bundled seeds (mirrors sync.ts fallback behavior).
    REFRESH_MODEL        OpenRouter model id (default: openai/gpt-5.6-luna).
    REFRESH_REASONING_EFFORT
                         Reasoning effort for the refresh model
                         (default: high; empty disables the parameter).
    REFRESH_MAX_CHARS    Max page-text chars sent to the model (default: 60000).
    REFRESH_MAX_TOKENS   Max completion tokens for extraction (default: 8000).
"""

import argparse
import csv
import html as html_mod
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SOURCES = {
    "cursor": {
        # Docs sites serve clean markdown at ".md" — the HTML page is a JS app.
        "url": os.environ.get(
            "CURSOR_DOCS_MD_URL",
            "https://cursor.com/docs/models-and-pricing.md",
        ),
        "seed": os.path.join(ROOT, "data", "cursor-models.csv"),
        "format": "markdown",
        # Static docs tables: safe for LLM extraction. Merges apply only
        # when at least this many rows come back (guards partial pages).
        "min_rows": 30,
    },
    "opencode": {
        "url": os.environ.get("OPENCODE_DOCS_MD_URL", "https://opencode.ai/docs/go.md"),
        "seed": os.path.join(ROOT, "data", "opencode-go.json"),
        "format": "markdown",
        "min_rows": 15,
    },
    "bench": {
        "url": "https://cursor.com/cursorbench",
        "seed": os.path.join(ROOT, "data", "cursorbench.json"),
        # Disabled: the page is a JS app whose results live in chart SVG
        # (top-10 labels only, values encoded as coordinates; the ".md"
        # endpoint returns the JS shell, not data). Server-side text
        # extraction yields prose mentions, which an LLM turns into
        # confabulated rows. Update data/cursorbench.json by hand from
        # official releases until Cursor ships a machine-readable table/API.
        "min_rows": 0,
        "auto": False,
    },
}

SYSTEM_PROMPT = (
    "You extract structured model pricing/benchmark data from documentation "
    "page text. Reply with ONLY a JSON object, no markdown fences, no prose. "
    "All prices are US dollars per 1 million tokens as numbers (never strings). "
    "Use null when a value is not published. Never invent models or numbers "
    "that are not stated in the page text."
)

EXTRACT_PROMPTS = {
    "cursor": (
        'From the page text below, extract Cursor model pricing. Reply ONLY: '
        '{"rows": [{"key": "<model id or task slug, lowercase>", '
        '"input": <number|null>, "output": <number|null>, '
        '"cache_read": <number|null>, "cache_write": <number|null>}]}. '
        "Include every priced model, including fast variants (key suffix "
        '"-fast"). Skip subscription plans (Pro/Ultra) and routing entries "'
        "without prices.\n\nPAGE TEXT:\n"
    ),
    "opencode": (
        'From the page text below, extract OpenCode Go model pricing. Reply ONLY: '
        '{"rows": [{"model_id": "<id from the endpoints table, e.g. kimi-k2.7-code>", '
        '"display_name": "<name>", "input": <number|null>, '
        '"output": <number|null>, "cache_read": <number|null>, '
        '"cache_write": <number|null>, "endpoint": "<url or null>", '
        '"notes": "<tier/peak caveats or null>"}]}. '
        "Use base-tier prices where tiers are listed and note the caveat.\n\nPAGE TEXT:\n"
    ),
    "bench": (
        "From the page text below, extract CursorBench benchmark results. "
        "Reply ONLY: "
        '{"benchmark": "<name/version, e.g. CursorBench 3.2>", "rows": '
        '[{"model": "<name>", "rank": <number>, "score": <number 0-100>, '
        '"cost_usd": <number|null>, "tokens": <number|null>, '
        '"steps": <number|null>}]}. '
        "Include every ranked model. Omit rows missing a score.\n\nPAGE TEXT:\n"
    ),
}


def log(msg: str) -> None:
    print(msg, flush=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_text(url: str, max_chars: int, fmt: str = "html") -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (effiq-agent-refresh/1.0)",
            # NOTE: cursor.com 404s the .md endpoint when Accept is
            # restricted to text/markdown — keep */*.
            "Accept": "*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    if fmt == "markdown":
        return raw[:max_chars]
    text = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", raw)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html_mod.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def openrouter_extract(
    api_key: str, model: str, source: str, page_text: str,
    reasoning_effort: str = "high", max_tokens: int = 8000,
) -> dict:
    body: dict = {
        "model": model,
        "temperature": 0,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": EXTRACT_PROMPTS[source] + page_text,
            },
        ],
    }
    if reasoning_effort:
        body["reasoning"] = {"effort": reasoning_effort}
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://effiq.pages.dev/",
            "X-Title": "effiq agent refresh",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.load(resp)
    content = payload["choices"][0]["message"]["content"]
    return json.loads(content)


def valid_price(v) -> bool:
    return v is None or (isinstance(v, (int, float)) and v >= 0)


def normalize_key(name: str) -> str:
    s = (name or "").lower()
    s = re.sub(r"\bcursor\b", "", s)
    s = re.sub(r"\(fast\)", "-fast", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


# ---------------------------------------------------------------- cursor CSV


def refresh_cursor_csv(seed_path: str, rows: list[dict], dry_run: bool) -> dict:
    if not rows:
        return {"status": "skipped", "reason": "no rows extracted"}
    with open(seed_path, "r", encoding="utf-8") as f:
        reader = list(csv.DictReader(f))
        fieldnames = list(reader[0].keys()) if reader else []
    if not fieldnames:
        return {"status": "error", "reason": "empty CSV"}

    price_map: dict[str, dict] = {}
    for r in rows:
        key = normalize_key(str(r.get("key") or ""))
        if not key or not any(
            valid_price(r.get(k)) and r.get(k) is not None
            for k in ("input", "output", "cache_read", "cache_write")
        ):
            continue
        price_map[key] = r
        base = key.replace("-fast", "")
        if base not in price_map:
            price_map[base] = r

    today = now_iso()[:10]
    stamp = now_iso()
    updated = unchanged = 0
    col_map = {
        "input": "price_input_usd_per_million",
        "output": "price_output_usd_per_million",
        "cache_read": "price_cache_read_usd_per_million",
        "cache_write": "price_cache_write_usd_per_million",
    }
    for row in reader:
        candidates = [
            (row.get("task_slug") or "").lower(),
            (row.get("model_id") or "").lower(),
            normalize_key(row.get("display_name") or ""),
        ]
        fast = (row.get("fast_mode") or "").lower() == "true"
        match = None
        for cand in candidates:
            if not cand:
                continue
            if fast:
                # Fast rows may ONLY take prices from an explicit fast
                # entry in the docs — never silently inherit standard
                # prices (Cursor fast mode is typically 2x per token).
                entry = price_map.get(f"{cand}-fast")
                if entry:
                    match = entry
                    break
            else:
                entry = price_map.get(cand)
                if entry and not str(entry.get("key") or "").endswith("-fast"):
                    match = entry
                    break
        if not match:
            unchanged += 1
            continue
        changed = False
        for src_k, col in col_map.items():
            v = match.get(src_k)
            if v is None:
                continue
            as_str = f"{v:g}"
            if row.get(col) != as_str:
                row[col] = as_str
                changed = True
        if changed:
            row["pricing_source_date"] = today
            row["data_pulled_at_utc"] = stamp
            updated += 1
        else:
            unchanged += 1

    if not dry_run and updated > 0:
        with open(seed_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(reader)
    return {
        "status": "ok",
        "total": len(reader),
        "updated": updated,
        "unchanged": unchanged,
        "dry_run": dry_run,
    }


# ------------------------------------------------------------- opencode JSON


def refresh_opencode_json(seed_path: str, rows: list[dict], dry_run: bool) -> dict:
    if not rows:
        return {"status": "skipped", "reason": "no rows extracted"}
    with open(seed_path, "r", encoding="utf-8") as f:
        catalog = json.load(f)
    by_id = {r.get("modelId"): r for r in catalog.get("results", [])}
    updated = added = 0
    for r in rows:
        mid = r.get("model_id")
        if not mid or not isinstance(mid, str):
            continue
        prices = {k: r.get(k) for k in ("input", "output", "cache_read", "cache_write")}
        if not all(valid_price(v) for v in prices.values()):
            continue
        if not any(v is not None for v in prices.values()):
            continue
        existing = by_id.get(mid)
        if existing is None:
            by_id[mid] = {
                "modelId": mid,
                "displayName": r.get("display_name") or mid,
                "provider": "via OpenCode Go",
                "endpoint": r.get("endpoint"),
                "priceInputUsdPerMillion": prices["input"],
                "priceOutputUsdPerMillion": prices["output"],
                "priceCacheReadUsdPerMillion": prices["cache_read"],
                "priceCacheWriteUsdPerMillion": prices["cache_write"],
                "monthlyUsageUsd": None,
                "notes": r.get("notes"),
            }
            added += 1
            continue
        changed = False
        mapping = {
            "input": "priceInputUsdPerMillion",
            "output": "priceOutputUsdPerMillion",
            "cache_read": "priceCacheReadUsdPerMillion",
            "cache_write": "priceCacheWriteUsdPerMillion",
        }
        for src_k, dst_k in mapping.items():
            if prices[src_k] is not None and existing.get(dst_k) != prices[src_k]:
                existing[dst_k] = prices[src_k]
                changed = True
        if r.get("notes") and not existing.get("notes"):
            existing["notes"] = r["notes"]
            changed = True
        if changed:
            updated += 1
    if updated or added:
        catalog["results"] = list(by_id.values())
        catalog["observedAt"] = now_iso()
        if not dry_run:
            with open(seed_path, "w", encoding="utf-8") as f:
                json.dump(catalog, f, indent=2)
                f.write("\n")
    return {"status": "ok", "updated": updated, "added": added, "dry_run": dry_run}


# ---------------------------------------------------------------- bench JSON


def bench_family_slug(name: str) -> str:
    s = (name or "").lower()
    s = re.sub(r"\bcursor\b", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def refresh_bench_json(
    seed_path: str, benchmark: str | None, rows: list[dict], dry_run: bool
) -> dict:
    if not rows:
        return {"status": "skipped", "reason": "no rows extracted"}
    with open(seed_path, "r", encoding="utf-8") as f:
        catalog = json.load(f)
    by_slug = {r.get("familySlug"): r for r in catalog.get("results", [])}
    updated = added = 0
    for r in rows:
        score = r.get("score")
        if not isinstance(score, (int, float)):
            continue
        slug = bench_family_slug(str(r.get("model") or ""))
        if not slug:
            continue
        effort = str(r.get("effort") or "medium").lower()
        item = {
            "rank": r.get("rank") if isinstance(r.get("rank"), int) else 0,
            "model": str(r.get("model")),
            "familySlug": slug,
            "effort": effort,
            "score": score,
            "costUsd": r.get("cost_usd") if valid_price(r.get("cost_usd")) else 0,
            "tokens": r.get("tokens") if isinstance(r.get("tokens"), int) else 0,
            "steps": r.get("steps") if isinstance(r.get("steps"), int) else 0,
        }
        existing = by_slug.get(slug)
        if existing is None:
            by_slug[slug] = item
            added += 1
        elif existing != item:
            by_slug[slug] = item
            updated += 1
    if updated or added:
        catalog["results"] = list(by_slug.values())
        catalog["observedAt"] = now_iso()
        if benchmark:
            catalog["benchmark"] = benchmark
        if not dry_run:
            with open(seed_path, "w", encoding="utf-8") as f:
                json.dump(catalog, f, indent=2)
                f.write("\n")
    return {"status": "ok", "updated": updated, "added": added, "dry_run": dry_run}


REFRESHERS = {
    "cursor": lambda seed, data, dry: refresh_cursor_csv(seed, data.get("rows", []), dry),
    "opencode": lambda seed, data, dry: refresh_opencode_json(
        seed, data.get("rows", []), dry
    ),
    "bench": lambda seed, data, dry: refresh_bench_json(
        seed, data.get("benchmark"), data.get("rows", []), dry
    ),
}


def self_test() -> int:
    """Exercise merge logic on synthetic data. No network, no key, no writes."""
    import copy
    import tempfile

    failures = []

    def check(name: str, cond: bool) -> None:
        log(f"  [{'ok' if cond else 'FAIL'}] {name}")
        if not cond:
            failures.append(name)

    # cursor CSV merge
    with tempfile.NamedTemporaryFile(
        "w", suffix=".csv", delete=False, encoding="utf-8"
    ) as f:
        f.write(
            "model_id,display_name,task_slug,fast_mode,"
            "price_input_usd_per_million,price_output_usd_per_million,"
            "price_cache_read_usd_per_million,price_cache_write_usd_per_million,"
            "pricing_source_date,data_pulled_at_utc\n"
            "kimi-k2,Kimi K2,kimi-k2,False,0.50,2.00,0.10,,2026-01-01,2026-01-01T00:00:00Z\n"
        )
        csv_path = f.name
    res = refresh_cursor_csv(
        csv_path,
        [{"key": "kimi-k2", "input": 0.95, "output": 4.0, "cache_read": 0.19,
          "cache_write": None}],
        dry_run=True,
    )
    check("cursor detects 1 price change", res.get("updated") == 1)
    check("cursor dry-run writes nothing",
          open(csv_path, encoding="utf-8").read().count("0.95") == 0)

    # Fast rows must never inherit standard-key prices
    with tempfile.NamedTemporaryFile(
        "w", suffix=".csv", delete=False, encoding="utf-8"
    ) as f:
        f.write(
            "model_id,display_name,task_slug,fast_mode,"
            "price_input_usd_per_million,price_output_usd_per_million,"
            "price_cache_read_usd_per_million,price_cache_write_usd_per_million,"
            "pricing_source_date,data_pulled_at_utc\n"
            "kimi-k2,Kimi K2,kimi-k2-fast,True,1.00,8.00,0.20,,2026-01-01,2026-01-01T00:00:00Z\n"
        )
        fast_csv_path = f.name
    res = refresh_cursor_csv(
        fast_csv_path,
        [{"key": "kimi-k2", "input": 0.95, "output": 4.0, "cache_read": 0.19,
          "cache_write": None}],
        dry_run=True,
    )
    check("cursor fast row ignores standard-key prices", res.get("updated") == 0)
    res = refresh_cursor_csv(
        fast_csv_path,
        [{"key": "kimi-k2-fast", "input": 1.9, "output": 8.0, "cache_read": 0.38,
          "cache_write": None}],
        dry_run=True,
    )
    check("cursor fast row takes explicit fast prices", res.get("updated") == 1)

    # opencode JSON merge (update + append, never delete)
    with tempfile.NamedTemporaryFile(
        "w", suffix=".json", delete=False, encoding="utf-8"
    ) as f:
        json.dump(
            {"benchmark": "OpenCode Go", "url": "u", "observedAt": "old",
             "results": [{"modelId": "kimi-k3", "displayName": "Kimi K3",
                          "priceInputUsdPerMillion": 1.0,
                          "priceOutputUsdPerMillion": 2.0,
                          "priceCacheReadUsdPerMillion": None,
                          "priceCacheWriteUsdPerMillion": None}]},
            f,
        )
        go_path = f.name
    before = copy.deepcopy(json.load(open(go_path, encoding="utf-8")))
    res = refresh_opencode_json(
        go_path,
        [{"model_id": "kimi-k3", "display_name": "Kimi K3", "input": 3.0,
          "output": 15.0, "cache_read": 0.3, "cache_write": None,
          "endpoint": None, "notes": None},
         {"model_id": "new-model", "display_name": "New Model", "input": 0.1,
          "output": 0.2, "cache_read": None, "cache_write": None,
          "endpoint": None, "notes": None}],
        dry_run=True,
    )
    check("opencode updates 1 + adds 1",
          res.get("updated") == 1 and res.get("added") == 1)
    check("opencode dry-run writes nothing",
          json.load(open(go_path, encoding="utf-8")) == before)

    # bench JSON merge (update in place, add new, keep rest)
    with tempfile.NamedTemporaryFile(
        "w", suffix=".json", delete=False, encoding="utf-8"
    ) as f:
        json.dump(
            {"benchmark": "CursorBench 3.2", "url": "u", "observedAt": "old",
             "results": [{"rank": 1, "model": "Kimi K2", "familySlug": "kimi-k2",
                          "effort": "medium", "score": 50.0, "costUsd": 1.0,
                          "tokens": 100, "steps": 5}]},
            f,
        )
        bench_path = f.name
    res = refresh_bench_json(
        bench_path, "CursorBench 3.3",
        [{"model": "Kimi K2", "rank": 2, "score": 55.5, "cost_usd": 1.2,
          "tokens": 110, "steps": 6}],
        dry_run=True,
    )
    check("bench updates changed row", res.get("updated") == 1)
    check("bench drops scoreless rows",
          refresh_bench_json(bench_path, None, [{"model": "X"}], dry_run=True)
          == {"status": "ok", "updated": 0, "added": 0, "dry_run": True})

    if failures:
        log(f"SELF-TEST FAILED: {failures}")
        return 1
    log("SELF-TEST PASSED")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="LLM-agent refresh of website-sourced seeds")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--only", default="cursor,opencode,bench")
    parser.add_argument("--model",
                        default=os.environ.get("REFRESH_MODEL", "openai/gpt-5.6-luna"))
    parser.add_argument("--reasoning-effort",
                        default=os.environ.get("REFRESH_REASONING_EFFORT", "high"))
    parser.add_argument("--max-tokens", type=int,
                        default=int(os.environ.get("REFRESH_MAX_TOKENS", "8000")))
    parser.add_argument("--max-chars", type=int,
                        default=int(os.environ.get("REFRESH_MAX_CHARS", "60000")))
    args = parser.parse_args()

    if args.self_test:
        return self_test()

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        log("[!] OPENROUTER_API_KEY not set — skipping agent refresh, "
            "sync will use bundled seeds.")
        return 0

    only = [s.strip() for s in args.only.split(",") if s.strip() in SOURCES]
    failed = False
    for source in only:
        cfg = SOURCES[source]
        if not cfg.get("auto", True):
            log(f"[*] {source}: auto-refresh disabled (JS-rendered results page "
                "with no machine-readable table) — update the seed manually "
                f"from official releases ({cfg['seed']}).")
            continue
        log(f"[*] {source}: fetching {cfg['url']} ...")
        try:
            page_text = fetch_text(cfg["url"], args.max_chars, cfg.get("format", "html"))
        except Exception as e:  # noqa: BLE001 - report and continue with bundled seed
            log(f"[!] {source}: fetch failed ({e}) — keeping bundled seed.")
            continue
        if len(page_text) < 2000:
            log(f"[!] {source}: page text too short ({len(page_text)} chars) — "
                "keeping bundled seed.")
            continue
        log(f"[*] {source}: extracting via {args.model} "
            f"(reasoning={args.reasoning_effort or 'off'}, {len(page_text)} chars) ...")
        try:
            data = openrouter_extract(api_key, args.model, source, page_text,
                                      args.reasoning_effort, args.max_tokens)
        except Exception as e:  # noqa: BLE001 - report and continue
            log(f"[!] {source}: extraction failed ({e}) — keeping bundled seed.")
            failed = True
            continue
        rows = data.get("rows", []) if isinstance(data, dict) else []
        min_rows = cfg.get("min_rows", 0)
        if len(rows) < min_rows:
            log(f"[!] {source}: only {len(rows)} rows extracted "
                f"(minimum {min_rows}) — keeping bundled seed.")
            continue
        try:
            res = REFRESHERS[source](cfg["seed"], data, args.dry_run)
        except Exception as e:  # noqa: BLE001 - never break sync on seed writes
            log(f"[!] {source}: merge failed ({e}) — keeping bundled seed.")
            failed = True
            continue
        log(f"[+] {source}: {json.dumps(res)}")

    if args.dry_run:
        log("[*] dry-run: no seed files were modified.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
