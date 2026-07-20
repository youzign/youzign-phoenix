#!/usr/bin/env python3
"""
extract-corpus.py — stream a mysqldump .sql.gz and emit compact JSONL for the
legacy-claim corpus (full-corpus seeding, DEZ-73).

Why a streaming parser instead of restoring the dump: there is no local MySQL
and only ~2 GB of free disk against a 2.8 GB compressed dump, so nothing may
be expanded to disk. We read the gzip stream once and write gzipped JSONL.

Why metadata-only by default: the v3 corpus is ~2.25M designs whose
designstrings total ~25 GB. Those cannot live in Postgres (see
docs/LEGACY-DATA-RESCUE.md); the plan of record is metadata in Postgres with
the designstring fetched from B2 on demand. --with-designstring is available
for the small v1/v2 tables where inlining is still viable.

Usage:
  python3 extract-corpus.py <dump.sql.gz> <out-dir> [--tables t1,t2] [--with-designstring]

Outputs (gzipped JSONL, one row per line):
  users.jsonl.gz          from wp_users
  designs_v12.jsonl.gz    from save_editor_design
  designs_v3.jsonl.gz     from wp_posts where post_type='designs'
  postmeta.jsonl.gz       from wp_postmeta, whitelisted meta_keys only
  stats.json              row counts, byte totals, per-table column maps
"""

import sys, os, gzip, json, argparse
from collections import defaultdict

TARGETS = {
    "wp_users": "users",
    "save_editor_design": "designs_v12",
    "wp_posts": "designs_v3",
    "wp_postmeta": "postmeta",
}

# Columns kept per table. Anything not listed is discarded at parse time so the
# output stays small enough for the free disk budget.
KEEP = {
    "wp_users": ["ID", "user_login", "user_email", "user_registered", "display_name"],
    "save_editor_design": ["id", "user_id", "design_name", "template_type",
                           "editor_type", "created", "dated", "hidden", "design_string"],
    "wp_posts": ["ID", "post_author", "post_title", "post_date", "post_modified",
                 "post_type", "post_status", "post_content"],
    "wp_postmeta": ["post_id", "meta_key", "meta_value"],
}

# post_content / design_string are the designstrings: huge, and excluded unless
# explicitly requested. We always record their length so the corpus can be sized.
BIG = {"wp_posts": "post_content", "save_editor_design": "design_string"}

META_KEYS = {"_thumbnail_id", "_user_folder", "template_type", "_wp_attached_file"}


def parse_values(buf, start):
    """Scan one (...) tuple from a mysqldump VALUES list.

    Returns (list_of_values, index_after_closing_paren). Values are str, or
    None for SQL NULL. Handles backslash escapes and quotes containing ),( —
    a naive split on '),(' corrupts any design XML containing those bytes.
    """
    vals, i, n = [], start, len(buf)
    assert buf[i] == "("
    i += 1
    while i < n:
        c = buf[i]
        if c == ")":
            return vals, i + 1
        if c == ",":
            i += 1
            continue
        if c == "'":
            i += 1
            out = []
            while i < n:
                ch = buf[i]
                if ch == "\\":
                    nxt = buf[i + 1] if i + 1 < n else ""
                    out.append({"n": "\n", "r": "\r", "t": "\t", "0": "\0",
                                "Z": "\x1a", "b": "\b"}.get(nxt, nxt))
                    i += 2
                    continue
                if ch == "'":
                    # doubled '' is a literal quote
                    if i + 1 < n and buf[i + 1] == "'":
                        out.append("'")
                        i += 2
                        continue
                    i += 1
                    break
                out.append(ch)
                i += 1
            vals.append("".join(out))
            continue
        # bare token: number, NULL, etc.
        j = i
        while j < n and buf[j] not in ",)":
            j += 1
        tok = buf[i:j].strip()
        vals.append(None if tok.upper() == "NULL" else tok)
        i = j
    raise ValueError("unterminated tuple")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dump")
    ap.add_argument("outdir")
    ap.add_argument("--tables", default=",".join(TARGETS))
    ap.add_argument("--with-designstring", action="store_true")
    args = ap.parse_args()

    wanted = {t for t in args.tables.split(",") if t in TARGETS}
    os.makedirs(args.outdir, exist_ok=True)

    cols = {}          # table -> [column names] from CREATE TABLE
    writers = {}
    stats = defaultdict(lambda: {"rows": 0, "kept": 0, "designstring_bytes": 0,
                                 "with_designstring": 0})

    def writer(table):
        if table not in writers:
            path = os.path.join(args.outdir, TARGETS[table] + ".jsonl.gz")
            writers[table] = gzip.open(path, "wt", encoding="utf-8", compresslevel=6)
        return writers[table]

    cur_table = None
    with gzip.open(args.dump, "rt", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if line.startswith("CREATE TABLE"):
                name = line.split("`")[1]
                cur_table = name if name in TARGETS else None
                if cur_table:
                    cols[cur_table] = []
                continue
            if cur_table and line.startswith("  `"):
                cols[cur_table].append(line.split("`")[1])
                continue
            if cur_table and line.startswith(")"):
                cur_table = None
                continue
            if not line.startswith("INSERT INTO `"):
                continue
            table = line.split("`")[1]
            if table not in wanted:
                continue
            colnames = cols.get(table)
            if not colnames:
                continue
            keep = KEEP[table]
            big = BIG.get(table)
            idx = line.index(" VALUES ") + 8
            while idx < len(line):
                if line[idx] != "(":
                    idx += 1
                    continue
                try:
                    vals, idx = parse_values(line, idx)
                except (ValueError, AssertionError):
                    break
                st = stats[table]
                st["rows"] += 1
                if len(vals) != len(colnames):
                    continue
                row = dict(zip(colnames, vals))

                # table-specific filters — applied before writing so the huge
                # wp_posts / wp_postmeta scans emit only relevant rows
                if table == "wp_posts" and row.get("post_type") != "designs":
                    continue
                if table == "wp_postmeta" and row.get("meta_key") not in META_KEYS:
                    continue

                if big:
                    ds = row.get(big) or ""
                    st["designstring_bytes"] += len(ds)
                    if ds:
                        st["with_designstring"] += 1

                out = {}
                for k in keep:
                    if k == big:
                        ds = row.get(k) or ""
                        out["designstring_len"] = len(ds)
                        out["designstring_head"] = ds[:1]  # '<' xml vs '{' json
                        if args.with_designstring:
                            out["designstring"] = ds
                        continue
                    out[k] = row.get(k)
                writer(table).write(json.dumps(out, ensure_ascii=False) + "\n")
                st["kept"] += 1

    for w in writers.values():
        w.close()
    with open(os.path.join(args.outdir, "stats.json"), "w") as f:
        json.dump({"dump": args.dump, "columns": cols, "stats": dict(stats)}, f, indent=2)
    print(json.dumps(dict(stats), indent=2))


if __name__ == "__main__":
    main()
