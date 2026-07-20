#!/usr/bin/env python3
"""
build-manifests.py — turn extracted JSONL into the rows we actually load:
one manifest per design-owning user, plus the normalized user list.

Input (from extract-corpus.py):
  <dir>/users.jsonl.gz        wp_users            (274k)
  <dir>/designs_v12.jsonl.gz  save_editor_design  (v1 in main dump / v2 in the 2015 dump)
  <dir>/designs_v3.jsonl.gz   wp_posts type=designs (2.25M)

Output:
  <out>/users.jsonl.gz      {user_id, username, email, registered}
  <out>/manifests.jsonl.gz  {user_id, design_count, designs:[{g,i,t,c,m,f,k}]}
  <out>/summary.json

Manifest entry keys are single letters on purpose: at ~2.25M entries the key
names are a meaningful fraction of the stored bytes.

Thumb keys (k) are emitted only for v1/v2, where the B2 layout is
deterministic: reverse(user_id)/<design_id>/thumb/<design_id>.png. v3 thumbs
live behind wp_postmeta._thumbnail_id and are a deferred follow-up — the
design list still shows titles and dates, and import does not need a thumb.
"""

import gzip, json, os, argparse
from collections import defaultdict


def rows(path):
    if not os.path.exists(path):
        return
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        for line in fh:
            yield json.loads(line)


def norm_ts(v):
    if not v or v.startswith("0000"):
        return None
    return v.replace(" ", "T") + "Z" if " " in v else v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("indir", nargs="+", help="one or more extract dirs (merged)")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    manifests = defaultdict(list)
    counts = defaultdict(int)

    for d in args.indir:
        # v1/v2 — save_editor_design. generation comes from editor_type when
        # present; the two dumps are different eras of the same table.
        for r in rows(os.path.join(d, "designs_v12.jsonl.gz")):
            uid = r.get("user_id")
            if not uid or uid == "0":
                continue
            if not r.get("designstring_len"):
                continue  # nothing to import
            gen = 2 if "v2" in d or "2015" in d else 1
            did = r.get("id")
            manifests[uid].append({
                "g": gen, "i": did,
                "t": (r.get("design_name") or "")[:120],
                "c": norm_ts(r.get("created")),
                "m": norm_ts(r.get("dated")),
                "f": "json" if r.get("designstring_head") == "{" else "xml",
                "k": f"{str(uid)[::-1]}/{did}/thumb/{did}.png",
            })
            counts[gen] += 1

        # v3 — wp_posts
        for r in rows(os.path.join(d, "designs_v3.jsonl.gz")):
            uid = r.get("post_author")
            if not uid or uid == "0":
                continue
            if not r.get("designstring_len"):
                continue
            manifests[uid].append({
                "g": 3, "i": r.get("ID"),
                "t": (r.get("post_title") or "")[:120],
                "c": norm_ts(r.get("post_date")),
                "m": norm_ts(r.get("post_modified")),
                "f": "json" if r.get("designstring_head") == "{" else "xml",
            })
            counts[3] += 1

    # newest first — matches what the claim grid shows
    for uid, lst in manifests.items():
        lst.sort(key=lambda x: (x.get("m") or x.get("c") or ""), reverse=True)

    n_users = 0
    owners_written = 0
    with gzip.open(os.path.join(args.out, "users.jsonl.gz"), "wt", encoding="utf-8") as uf:
        for d in args.indir:
            for r in rows(os.path.join(d, "users.jsonl.gz")):
                uid = r.get("ID")
                email = (r.get("user_email") or "").strip()
                login = (r.get("user_login") or "").strip()
                if not uid or (not email and not login):
                    continue
                uf.write(json.dumps({
                    "user_id": int(uid),
                    "username": login,
                    "email": email,
                    "registered": norm_ts(r.get("user_registered")),
                    "designs_v1": sum(1 for x in manifests.get(uid, []) if x["g"] == 1),
                    "designs_v2": sum(1 for x in manifests.get(uid, []) if x["g"] == 2),
                    "designs_v3": sum(1 for x in manifests.get(uid, []) if x["g"] == 3),
                }, ensure_ascii=False) + "\n")
                n_users += 1

    total_bytes = 0
    with gzip.open(os.path.join(args.out, "manifests.jsonl.gz"), "wt", encoding="utf-8") as mf:
        for uid, lst in manifests.items():
            payload = json.dumps({"user_id": int(uid), "design_count": len(lst),
                                  "designs": lst}, ensure_ascii=False)
            total_bytes += len(payload)
            mf.write(payload + "\n")
            owners_written += 1

    summary = {
        "users": n_users, "owners": owners_written,
        "designs_by_generation": dict(counts),
        "total_designs": sum(counts.values()),
        "manifest_json_bytes": total_bytes,
        "manifest_json_mb": round(total_bytes / 1e6, 1),
    }
    with open(os.path.join(args.out, "summary.json"), "w") as f:
        json.dump(summary, f, indent=2)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
