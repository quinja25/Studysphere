"""
Downloads all IB Economics past papers from arrib.qzz.io
Organizes by year and exam session into separate folders.
Run: python download_economics.py
"""

import os
import re
import urllib.parse
import time
import requests

BASE_URL = "https://arrib.qzz.io/IB%20PAST%20PAPERS%20-%20YEAR/"
FILE_PATHS_URL = "https://arrib.qzz.io/Download%20past%20papers%20by%20subjects/file-paths.txt"
OUTPUT_DIR = r"C:\Users\jaeyo\OneDrive\Desktop\업무용\Economics Past Papers"

YEARS = range(2010, 2026)
SESSIONS = ["May", "November"]


def get_economics_paths():
    print("Fetching file list...")
    resp = requests.get(FILE_PATHS_URL, timeout=30)
    resp.raise_for_status()

    paths = [line.strip() for line in resp.text.splitlines() if line.strip()]
    economics = [p for p in paths if "Economics" in p]

    filtered = []
    for p in economics:
        for year in YEARS:
            for session in SESSIONS:
                if f"{session} {year}" in p:
                    filtered.append(p)
                    break
            else:
                continue
            break

    print(f"Found {len(filtered)} economics files (2010-2025, May & November).")
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


def download_file(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    with open(dest, "wb") as f:
        f.write(resp.content)


def main():
    paths = get_economics_paths()

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Saving to: {OUTPUT_DIR}\n")

    failed = []
    for i, path in enumerate(paths, 1):
        year, session = extract_year_session(path)
        filename = path.split("/")[-1]
        dest = os.path.join(OUTPUT_DIR, year, session, filename)

        if os.path.exists(dest):
            print(f"[{i}/{len(paths)}] Skipped (exists): {year}/{session}/{filename}")
            continue

        url = build_url(path)
        try:
            download_file(url, dest)
            print(f"[{i}/{len(paths)}] Downloaded: {year}/{session}/{filename}")
        except Exception as e:
            print(f"[{i}/{len(paths)}] FAILED: {year}/{session}/{filename} — {e}")
            failed.append(f"{year}/{session}/{filename}")

        time.sleep(0.2)

    print(f"\nDone! {len(paths) - len(failed)}/{len(paths)} downloaded.")
    if failed:
        print(f"\n{len(failed)} failed:")
        for f in failed:
            print(f"  - {f}")


if __name__ == "__main__":
    main()
