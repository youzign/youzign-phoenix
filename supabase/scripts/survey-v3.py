#!/usr/bin/env python3
"""
survey-v3.py — one streaming pass over wp_posts in a mysqldump, emitting only
AGGREGATES (plus rows for an optional focus author).

Purpose: size the v3 corpus for the full-corpus seeding decision without
writing 2.25M rows to a disk that has no room for them. Answers:
  - how many v3 designs exist, and how many distinct owners
  - total designstring bytes (the Postgres-vs-B2 decision)
  - XML vs JSON split (JSON needs convertLegacyJsonDesign at import)
  - per-owner design counts, so "how many users are actually served" is known

Usage: python3 survey-v3.py <dump.sql.gz> <out.json> [--author ID]
"""

import sys, gzip, json, argparse, importlib.util, os
from collections import Counter

spec = importlib.util.spec_from_file_location(
    "ec", os.path.join(os.path.dirname(os.path.abspath(__file__)), "extract-corpus.py"))
ec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ec)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dump")
    ap.add_argument("out")
    ap.add_argument("--author")
    args = ap.parse_args()

    cols, cur = None, None
    per_author = Counter()
    focus = []
    n = xml = js = empty = 0
    total_bytes = 0
    status_counts = Counter()
    year_counts = Counter()

    with gzip.open(args.dump, "rt", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if line.startswith("CREATE TABLE"):
                cur = "wp_posts" if line.split("`")[1] == "wp_posts" else None
                if cur:
                    cols = []
                continue
            if cur and line.startswith("  `"):
                cols.append(line.split("`")[1])
                continue
            if cur and line.startswith(")"):
                cur = None
                continue
            if not line.startswith("INSERT INTO `wp_posts`") or not cols:
                continue
            idx = line.index(" VALUES ") + 8
            while idx < len(line):
                if line[idx] != "(":
                    idx += 1
                    continue
                try:
                    vals, idx = ec.parse_values(line, idx)
                except (ValueError, AssertionError):
                    break
                if len(vals) != len(cols):
                    continue
                row = dict(zip(cols, vals))
                if row.get("post_type") != "designs":
                    continue
                n += 1
                author = row.get("post_author")
                per_author[author] += 1
                status_counts[row.get("post_status")] += 1
                d = row.get("post_date") or ""
                year_counts[d[:4]] += 1
                content = row.get("post_content") or ""
                total_bytes += len(content)
                head = content.lstrip()[:1]
                if not content.strip():
                    empty += 1
                elif head == "{":
                    js += 1
                elif head == "<":
                    xml += 1
                if args.author and author == args.author:
                    focus.append({
                        "ID": row.get("ID"), "title": row.get("post_title"),
                        "date": row.get("post_date"), "modified": row.get("post_modified"),
                        "status": row.get("post_status"), "len": len(content),
                        "format": "json" if head == "{" else ("xml" if head == "<" else "empty"),
                    })

    owners = len(per_author)
    dist = Counter()
    for c in per_author.values():
        dist["1" if c == 1 else "2-10" if c <= 10 else "11-100" if c <= 100 else "101-1000" if c <= 1000 else "1000+"] += 1

    out = {
        "v3_designs": n, "distinct_owners": owners,
        "designstring_bytes": total_bytes,
        "designstring_gb": round(total_bytes / 1e9, 2),
        "xml": xml, "json": js, "empty": empty,
        "status": dict(status_counts.most_common(10)),
        "by_year": dict(sorted(year_counts.items())),
        "owners_by_design_count": dict(dist),
        "top_owners": per_author.most_common(10),
    }
    if args.author:
        out["focus_author"] = args.author
        out["focus_designs"] = len(focus)
        out["focus_sample"] = focus[:25]
    with open(args.out, "w") as f:
        json.dump(out, f, indent=2)
    print(json.dumps({k: v for k, v in out.items() if k != "focus_sample"}, indent=2))


if __name__ == "__main__":
    main()
