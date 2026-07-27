#!/usr/bin/env python3
"""
yzb2up.py — stream v3 designstrings out of the WP dump straight into B2.

Reads /Users/dezygn/Projects/backup/youzign-db-backup (1).sql.gz (never
expanded to disk), filters wp_posts post_type='designs', and uploads each
non-empty post_content to b2://youzign-archive/_legacy_designs/v3/<ID>.xml —
the exact key the youzign-legacy-claim edge function fetches.

Resumable: designs are processed in dump order, in batches; the checkpoint
(count of designs already committed) lives in ~/Projects/backup/ so it
survives reboots. Re-run after any interruption.

Disk floor: aborts if the Mac drops under 2 GB free (house rule).
"""

import gzip, json, os, sys, time, hashlib, threading, queue, argparse
import urllib.request, urllib.error, base64, importlib.util

DUMP = "/Users/dezygn/Projects/backup/youzign-db-backup (1).sql.gz"
CKPT = "/Users/dezygn/Projects/backup/b2up-v3.ckpt"
KEY_ID = os.environ["YZ_B2_KEY_ID"]
APP_KEY = os.environ["YZ_B2_APP_KEY"]
BUCKET_ID = os.environ["YZ_B2_BUCKET_ID"]
PREFIX = "_legacy_designs/v3/"
WORKERS = 64
BATCH = 2000
FLOOR_MB = 2048

spec = importlib.util.spec_from_file_location(
    "ec", "/Users/dezygn/Projects/dev/youzign-next/supabase/scripts/extract-corpus.py")
ec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ec)


def b2_call(url, payload=None, headers=None, data=None, attempts=5):
    for a in range(attempts):
        try:
            body = data if data is not None else (
                json.dumps(payload).encode() if payload is not None else None)
            req = urllib.request.Request(url, data=body, headers=headers or {})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except (urllib.error.HTTPError, urllib.error.URLError, OSError) as e:
            code = getattr(e, "code", None)
            if a == attempts - 1:
                raise
            time.sleep(2 ** a)
    raise RuntimeError("unreachable")


class B2:
    def __init__(self):
        self.lock = threading.Lock()
        self.authorize()

    def authorize(self):
        cred = base64.b64encode(f"{KEY_ID}:{APP_KEY}".encode()).decode()
        j = b2_call("https://api.backblazeb2.com/b2api/v3/b2_authorize_account",
                    headers={"Authorization": f"Basic {cred}"})
        api = j.get("apiInfo", {}).get("storageApi", {})
        self.api_url = api.get("apiUrl") or j["apiUrl"]
        self.token = j["authorizationToken"]

    def upload_url(self):
        with self.lock:
            j = b2_call(f"{self.api_url}/b2api/v3/b2_get_upload_url",
                        payload={"bucketId": BUCKET_ID},
                        headers={"Authorization": self.token,
                                 "Content-Type": "application/json"})
        return j["uploadUrl"], j["authorizationToken"]


def worker(b2, q, done, errors):
    url, tok = None, None
    while True:
        item = q.get()
        if item is None:
            return
        design_id, content = item
        body = content.encode("utf-8")
        sha1 = hashlib.sha1(body).hexdigest()
        name = PREFIX + design_id + ".xml"
        for attempt in range(6):
            try:
                if url is None:
                    url, tok = b2.upload_url()
                req = urllib.request.Request(url, data=body, headers={
                    "Authorization": tok,
                    "X-Bz-File-Name": urllib.request.quote(name),
                    "Content-Type": "text/xml",
                    "Content-Length": str(len(body)),
                    "X-Bz-Content-Sha1": sha1,
                })
                with urllib.request.urlopen(req, timeout=180) as r:
                    r.read()
                done.append(len(body))
                break
            except Exception as e:
                url = None  # upload URLs are single-use on failure
                code = getattr(e, "code", None)
                if code == 401:
                    try:
                        b2.authorize()
                    except Exception:
                        pass
                if attempt == 5:
                    errors.append((design_id, str(e)[:200]))
                    break
                time.sleep(min(2 ** attempt, 30))
        q.task_done()


def free_mb():
    st = os.statvfs("/Users/dezygn")
    return st.f_bavail * st.f_frsize // (1024 * 1024)


def designs(dump):
    """Yield (design_id, post_content) for every v3 design, in dump order."""
    cols = None
    in_posts = False
    with gzip.open(dump, "rt", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if line.startswith("CREATE TABLE"):
                name = line.split("`")[1]
                in_posts = name == "wp_posts"
                if in_posts:
                    cols = []
                continue
            if in_posts and cols is not None and line.startswith("  `"):
                cols.append(line.split("`")[1])
                continue
            if in_posts and line.startswith(")"):
                in_posts = False
                continue
            if not line.startswith("INSERT INTO `wp_posts`"):
                continue
            i_id = cols.index("ID")
            i_type = cols.index("post_type")
            i_content = cols.index("post_content")
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
                if vals[i_type] != "designs":
                    continue
                content = vals[i_content]
                if not content:
                    continue
                yield vals[i_id], content


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="stop after N uploads (pilot)")
    args = ap.parse_args()

    ckpt = 0
    if os.path.exists(CKPT):
        ckpt = json.load(open(CKPT)).get("committed", 0)
    print(f"[start] resuming past {ckpt:,} committed designs", flush=True)

    b2 = B2()
    q = queue.Queue(maxsize=WORKERS * 4)
    done, errors = [], []
    threads = [threading.Thread(target=worker, args=(b2, q, done, errors), daemon=True)
               for _ in range(WORKERS)]
    for t in threads:
        t.start()

    t0 = time.time()
    seen = committed = 0
    uploaded_this_run = 0
    batch_n = 0
    for design_id, content in designs(DUMP):
        seen += 1
        if seen <= ckpt:
            continue
        q.put((design_id, content))
        batch_n += 1
        if batch_n >= BATCH:
            q.join()
            committed = seen
            json.dump({"committed": committed}, open(CKPT, "w"))
            uploaded_this_run += batch_n
            batch_n = 0
            rate = uploaded_this_run / max(time.time() - t0, 1)
            eta_h = (2232211 - committed) / max(rate, 1) / 3600
            print(f"[up] {committed:,} committed ({rate:.0f}/s, ~{eta_h:.1f}h left,"
                  f" {len(errors)} errors)", flush=True)
            if free_mb() < FLOOR_MB:
                print("[abort] disk under 2GB floor", flush=True)
                break
            if args.limit and uploaded_this_run >= args.limit:
                print("[limit] pilot limit reached", flush=True)
                break

    q.join()
    committed = seen
    json.dump({"committed": committed}, open(CKPT, "w"))
    for _ in threads:
        q.put(None)
    if errors:
        print(f"[errors] {len(errors)} failed, first 5: {errors[:5]}", flush=True)
        with open(CKPT + ".errors", "a") as f:
            for e in errors:
                f.write(json.dumps(e) + "\n")
    print(f"UPLOAD_DONE committed={committed:,} errors={len(errors)}", flush=True)


if __name__ == "__main__":
    main()
