#!/usr/bin/env python3
"""
cursor_pricing_pyagent.py
-------------------------
A lightweight Python agent that fetches the latest published model pricing
from Cursor's documentation (https://cursor.com/docs/models-and-pricing)
and updates `data/cursor-models.csv` with newly detected pricing deltas.

Usage:
    python3 scripts/cursor_pricing_pyagent.py
    python3 scripts/cursor_pricing_pyagent.py --dry-run
"""

import argparse
import csv
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

def load_env(env_path: str = None) -> None:
    """Loads key-value pairs from .env into os.environ if present."""
    if env_path is None:
        env_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            ".env",
        )
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip("'\"")
                if k and k not in os.environ:
                    os.environ[k] = v

load_env()

DOCS_URL = os.environ.get("CURSOR_DOCS_URL", "https://cursor.com/docs/models-and-pricing")
DEFAULT_CSV_PATH = os.environ.get(
    "CURSOR_MODELS_CSV",
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data",
        "cursor-models.csv",
    ),
)

def fetch_cursor_docs(url: str, api_key: str = None) -> str:
    """Fetches the raw HTML/markdown from Cursor's docs."""
    headers = {
        "User-Agent": "Mozilla/5.0 (PyAgent/1.0; effiq model-sync)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    key = api_key or os.environ.get("CURSOR_API_KEY")
    if key:
        headers["Authorization"] = f"Bearer {key}"

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read().decode("utf-8")

def parse_price(val_str: str) -> str:
    """Parses '$ 2.5' or '$0.50' or '-' into a clean numeric string or empty string."""
    if not val_str or "-" in val_str:
        return ""
    m = re.search(r"[\$]?\s*([0-9]+(?:\.[0-9]+)?)", val_str)
    if m:
        num = float(m.group(1))
        return f"{num:g}"
    return ""

def normalize_key(name: str) -> str:
    """Normalizes model names for fuzzy matching."""
    s = name.lower()
    s = re.sub(r"\bcursor\b", "", s)
    s = re.sub(r"\(fast\)", "-fast", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")

def extract_pricing_tables(html: str) -> list[dict]:
    """
    Extracts pricing rows from the Cursor documentation tables.
    Returns list of dicts:
        name, input_usd, cache_write_usd, cache_read_usd, output_usd, is_fast
    """
    tables = re.findall(r"<table[^>]*>(.*?)</table>", html, re.DOTALL | re.IGNORECASE)
    results = []
    seen = set()

    for table in tables:
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.DOTALL | re.IGNORECASE)
        for row in rows:
            cells = [
                re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", c)).strip()
                for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.DOTALL | re.IGNORECASE)
            ]
            if len(cells) >= 4 and any("$" in c for c in cells):
                name = cells[0]
                # Filter out membership subscription plans
                if name.lower() in ("pro", "pro plus", "ultra", "plan", "start (india only)"):
                    continue

                if name in seen:
                    continue
                seen.add(name)

                # Format is typically: Name | Input | Cache Write | Cache Read | Output
                # Or: Name | Input | Cache Read | Output
                input_p = ""
                cache_w_p = ""
                cache_r_p = ""
                output_p = ""

                if len(cells) == 5:
                    input_p = parse_price(cells[1])
                    cache_w_p = parse_price(cells[2])
                    cache_r_p = parse_price(cells[3])
                    output_p = parse_price(cells[4])
                elif len(cells) == 4:
                    input_p = parse_price(cells[1])
                    cache_r_p = parse_price(cells[2])
                    output_p = parse_price(cells[3])

                is_fast = "fast" in name.lower()
                results.append({
                    "raw_name": name,
                    "norm_key": normalize_key(name),
                    "input_usd": input_p,
                    "cache_write_usd": cache_w_p,
                    "cache_read_usd": cache_r_p,
                    "output_usd": output_p,
                    "is_fast": is_fast,
                })

    return results

def update_cursor_csv(
    csv_path: str,
    pricing_data: list[dict],
    dry_run: bool = False,
) -> dict:
    """
    Reads cursor-models.csv, matches rows against newly extracted pricing,
    and updates ONLY changed/relevant pricing fields.
    """
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Cursor CSV not found at {csv_path}")

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = list(csv.DictReader(f))
        fieldnames = reader[0].keys() if reader else []

    if not fieldnames:
        return {"error": "Empty CSV"}

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    updated_rows = 0
    unchanged_rows = 0

    # Build lookup map from pricing_data
    price_map = {}
    for item in pricing_data:
        price_map[item["norm_key"]] = item
        # Also map without fast suffix
        base_key = item["norm_key"].replace("-fast", "")
        if base_key not in price_map:
            price_map[base_key] = item

    for row in reader:
        model_id = (row.get("model_id") or "").lower()
        task_slug = (row.get("task_slug") or "").lower()
        display_name = (row.get("display_name") or "").lower()
        fast_mode = (row.get("fast_mode") or "").lower() == "true"

        # Try finding a matching pricing record
        match = None
        for cand_key in [task_slug, model_id, normalize_key(display_name)]:
            if fast_mode and f"{cand_key}-fast" in price_map:
                match = price_map[f"{cand_key}-fast"]
                break
            if not fast_mode and cand_key in price_map and not price_map[cand_key]["is_fast"]:
                match = price_map[cand_key]
                break
            if cand_key in price_map:
                match = price_map[cand_key]
                break

        if match:
            changed = False
            # Check price_input_usd_per_million
            if match["input_usd"] and row.get("price_input_usd_per_million") != match["input_usd"]:
                row["price_input_usd_per_million"] = match["input_usd"]
                changed = True

            # Check price_output_usd_per_million
            if match["output_usd"] and row.get("price_output_usd_per_million") != match["output_usd"]:
                row["price_output_usd_per_million"] = match["output_usd"]
                changed = True

            # Check price_cache_read_usd_per_million
            if match["cache_read_usd"] and row.get("price_cache_read_usd_per_million") != match["cache_read_usd"]:
                row["price_cache_read_usd_per_million"] = match["cache_read_usd"]
                changed = True

            # Check price_cache_write_usd_per_million
            if match["cache_write_usd"] and row.get("price_cache_write_usd_per_million") != match["cache_write_usd"]:
                row["price_cache_write_usd_per_million"] = match["cache_write_usd"]
                changed = True

            if changed:
                row["pricing_source_date"] = today_str
                row["data_pulled_at_utc"] = now_iso
                updated_rows += 1
            else:
                unchanged_rows += 1
        else:
            unchanged_rows += 1

    if not dry_run and updated_rows > 0:
        with open(csv_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(reader)

    return {
        "total_rows": len(reader),
        "updated_rows": updated_rows,
        "unchanged_rows": unchanged_rows,
        "extracted_models": len(pricing_data),
        "dry_run": dry_run,
    }

def main():
    parser = argparse.ArgumentParser(description="Fetch Cursor model pricing and update cursor-models.csv")
    parser.add_argument("--url", default=DOCS_URL, help="Cursor pricing docs URL")
    parser.add_argument("--csv-path", default=DEFAULT_CSV_PATH, help="Path to cursor-models.csv")
    parser.add_argument("--dry-run", action="store_true", help="Perform a trial run without modifying CSV")
    args = parser.parse_args()

    print(f"[*] PyAgent: Fetching Cursor pricing documentation from {args.url}...")
    try:
        html = fetch_cursor_docs(args.url)
    except Exception as e:
        print(f"[!] Failed to fetch docs: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"[*] PyAgent: Extracting published pricing matrices from HTML...")
    pricing = extract_pricing_tables(html)
    print(f"[*] Extracted {len(pricing)} model pricing entries:")
    for p in pricing:
        print(f"    - {p['raw_name']:<30} | In: ${p['input_usd'] or '—'}/1M | Out: ${p['output_usd'] or '—'}/1M | Cache Read: ${p['cache_read_usd'] or '—'}/1M")

    print(f"[*] PyAgent: Updating CSV at {args.csv_path} (dry-run: {args.dry_run})...")
    res = update_cursor_csv(args.csv_path, pricing, dry_run=args.dry_run)
    print(f"[+] Sync Complete: {res['total_rows']} total rows, {res['updated_rows']} updated, {res['unchanged_rows']} unchanged.")

if __name__ == "__main__":
    main()
