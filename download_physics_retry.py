"""
Retries missing IB Physics past papers by diffing the full index against what's on disk.
Run: python download_physics_retry.py
"""

import os
import re
import urllib.parse
import time
import requests

BASE_URL = "https://arrib.qzz.io/IB%20PAST%20PAPERS%20-%20YEAR/"
FILE_PATHS_URL = "https://arrib.qzz.io/Download%20past%20papers%20by%20subjects/file-paths.txt"
OUTPUT_DIR = r"C:\Users\jaeyo\OneDrive\Desktop\업무용\Physics Past Papers"

YEARS = range(2010, 2026)
SESSIONS = ["May", "November"]
EXCLUDE = ["French", "Spanish", "German"]


def get_physics_paths():
    print("Fetching file list...")
    resp = requests.get(FILE_PATHS_URL, timeout=30)
    resp.raise_for_status()

    paths = [line.strip() for line in resp.text.splitlines() if line.strip()]
    physics = [p for p in paths if "Physics" in p]
    physics = [p for p in physics if not any(ex in p for ex in EXCLUDE)]

    filtered = []
    for p in physics:
        for year in YEARS:
            for session in SESSIONS:
                if f"{session} {year}" in p:
                    filtered.append(p)
                    break
            else:
                continue
            break

    return filtered


def build_url(path):
    if path.startswith("./"):
        path = path[2:]
    parts = path.split("/")
    encoded = "/".join(urllib.parse.quote(part) for part in parts)
    return BASE_URL + encoded


def extract_year_session(path):
    match = re.search(r"(May|November) (\d{4})", path)
    if match:
        return match.group(2), f"{match.group(1)} {match.group(2)}"
    return "Other", "Other"


def download_file(url, dest, retries=5):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(url, timeout=120)
            if resp.status_code == 404:
                return "not_found"
            resp.raise_for_status()
            with open(dest, "wb") as f:
                f.write(resp.content)
            return "ok"
        except Exception as e:
            if attempt == retries:
                raise
            wait = 2 ** attempt
            print(f"    Attempt {attempt} failed ({e}), retrying in {wait}s...")
            time.sleep(wait)
    return "error"


def main():
    all_paths = get_physics_paths()

    missing = []
    for path in all_paths:
        year, session = extract_year_session(path)
        filename = path.split("/")[-1]
        dest = os.path.join(OUTPUT_DIR, year, session, filename)
        if not os.path.exists(dest):
            missing.append(path)

    print(f"Total physics files: {len(all_paths)}")
    print(f"Already downloaded: {len(all_paths) - len(missing)}")
    print(f"Missing (will retry): {len(missing)}\n")

    if not missing:
        print("Nothing to do — all files already downloaded.")
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    failed = []
    for i, path in enumerate(missing, 1):
        year, session = extract_year_session(path)
        filename = path.split("/")[-1]
        dest = os.path.join(OUTPUT_DIR, year, session, filename)

        url = build_url(path)
        try:
            result = download_file(url, dest)
            if result == "not_found":
                print(f"[{i}/{len(missing)}] 404 (skipped): {year}/{session}/{filename}")
            else:
                print(f"[{i}/{len(missing)}] Downloaded: {year}/{session}/{filename}")
        except Exception as e:
            print(f"[{i}/{len(missing)}] FAILED: {year}/{session}/{filename} — {e}")
            failed.append(f"{year}/{session}/{filename}")

        time.sleep(0.5)

    print(f"\nDone! {len(missing) - len(failed)}/{len(missing)} downloaded.")
    if failed:
        print(f"\n{len(failed)} still failed:")
        for f in failed:
            print(f"  - {f}")


if __name__ == "__main__":
    main()
