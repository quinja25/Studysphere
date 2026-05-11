"""
Uses a real browser (playwright) to fetch file-paths.txt from arrib.cc
and saves it locally so the download scripts can use it.

Install once:
    pip install playwright
    playwright install chromium

Run:
    python fetch_file_paths.py
"""

import asyncio
from playwright.async_api import async_playwright

PAGE_URL = "https://arrib.cc/Download%20past%20papers%20by%20subjects/"
FILE_PATHS_URL = "https://arrib.cc/Download%20past%20papers%20by%20subjects/file-paths.txt"
OUTPUT = "file-paths.txt"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()

        captured = {}

        async def handle_response(response):
            if "file-paths.txt" in response.url:
                try:
                    body = await response.body()
                    captured["text"] = body.decode("utf-8")
                    print(f"Captured file-paths.txt ({len(captured['text'])} chars)")
                except Exception as e:
                    print(f"Failed to read response body: {e}")

        page = await context.new_page()
        page.on("response", handle_response)

        print(f"Opening {PAGE_URL} ...")
        await page.goto(PAGE_URL, wait_until="networkidle", timeout=60000)

        # If the page didn't trigger the fetch automatically, fetch it directly
        if "text" not in captured:
            print("Fetching file-paths.txt directly via browser context...")
            response = await page.request.get(FILE_PATHS_URL)
            text = await response.text()
            captured["text"] = text
            print(f"Fetched file-paths.txt ({len(text)} chars)")

        await browser.close()

        if "text" not in captured:
            print("ERROR: Could not capture file-paths.txt")
            return

        content = captured["text"]

        # Sanity check — should start with './' paths not HTML
        first_line = content.strip().splitlines()[0] if content.strip() else ""
        if first_line.startswith("<"):
            print("ERROR: Got HTML instead of file paths. The URL may be wrong.")
            return

        with open(OUTPUT, "w", encoding="utf-8") as f:
            f.write(content)

        line_count = len([l for l in content.splitlines() if l.strip()])
        print(f"Saved {line_count} file paths to {OUTPUT}")


if __name__ == "__main__":
    asyncio.run(main())
