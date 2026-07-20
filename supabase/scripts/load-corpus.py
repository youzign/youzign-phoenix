#!/usr/bin/env python3
"""
load-corpus.py — upsert the extracted corpus into Supabase via PostgREST.

There is no psql on this machine and the dump is far too large for
`supabase db query`, so we batch-upsert over HTTPS with the service-role key.
Resumable: a checkpoint file records how many lines of each input have been
committed, so an interrupted run continues instead of restarting.

Env:
  SUPABASE_URL               e.g. https://xnxcduqzexwukehavthg.supabase.co
  SUPABASE_SERVICE_ROLE_KEY  service_role key for that project

Usage:
  python3 load-corpus.py <built-dir> [--only users|manifests] [--batch N] [--dry-run]
"""

import os, sys, gzip, json, time, argparse, urllib.request, urllib.error

def post(url, key, table, rows, on_conflict):
    body = json.dumps(rows).encode()
    req = urllib.request.Request(
        f"{url}/rest/v1/{table}?on_conflict={on_conflict}",
        data=body, method="POST",
        headers={
            "apikey": key, "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        })
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.status


def send(url, key, table, rows, on_conflict, attempts=5):
    for a in range(attempts):
        try:
            return post(url, key, table, rows, on_conflict)
        except urllib.error.HTTPError as e:
            detail = e.read()[:400].decode("utf-8", "replace")
            # 4xx other than rate limiting is a real error — surface it now
            # rather than retrying a request that can never succeed.
            if e.code not in (408, 429, 500, 502, 503, 504):
                raise SystemExit(f"[fatal] {table} HTTP {e.code}: {detail}")
            wait = 2 ** a
            print(f"[retry] {table} HTTP {e.code} — sleeping {wait}s", flush=True)
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError) as e:
            wait = 2 ** a
            print(f"[retry] {table} {e} — sleeping {wait}s", flush=True)
            time.sleep(wait)
    raise SystemExit(f"[fatal] {table}: giving up after {attempts} attempts")


def stream(path, skip):
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        for n, line in enumerate(fh):
            if n < skip:
                continue
            yield n, json.loads(line)


def run(name, path, table, on_conflict, url, key, batch, ckpt, ckpt_path, dry):
    if not os.path.exists(path):
        print(f"[skip] {path} missing")
        return
    done = ckpt.get(name, 0)
    buf, last = [], done - 1
    t0, sent = time.time(), 0
    for n, row in stream(path, done):
        buf.append(row)
        last = n
        if len(buf) >= batch:
            if not dry:
                send(url, key, table, buf, on_conflict)
            sent += len(buf)
            buf = []
            ckpt[name] = last + 1
            with open(ckpt_path, "w") as f:
                json.dump(ckpt, f)
            rate = sent / max(time.time() - t0, 1)
            print(f"[{name}] {ckpt[name]:,} committed ({rate:.0f} rows/s)", flush=True)
    if buf:
        if not dry:
            send(url, key, table, buf, on_conflict)
        sent += len(buf)
        ckpt[name] = last + 1
        with open(ckpt_path, "w") as f:
            json.dump(ckpt, f)
    print(f"[{name}] DONE — {ckpt.get(name,0):,} rows total", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("built")
    ap.add_argument("--only", choices=["users", "manifests"])
    ap.add_argument("--batch", type=int, default=500)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not args.dry_run and (not url or not key):
        raise SystemExit("set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")

    ckpt_path = os.path.join(args.built, "load-checkpoint.json")
    ckpt = json.load(open(ckpt_path)) if os.path.exists(ckpt_path) else {}

    if args.only in (None, "users"):
        run("users", os.path.join(args.built, "users.jsonl.gz"),
            "yz_legacy_users", "user_id", url, key, args.batch, ckpt, ckpt_path, args.dry_run)
    if args.only in (None, "manifests"):
        # manifests carry whole design lists — smaller batches keep request
        # bodies sane for users with thousands of designs.
        run("manifests", os.path.join(args.built, "manifests.jsonl.gz"),
            "yz_legacy_manifests", "user_id", url, key,
            max(1, args.batch // 10), ckpt, ckpt_path, args.dry_run)


if __name__ == "__main__":
    main()
