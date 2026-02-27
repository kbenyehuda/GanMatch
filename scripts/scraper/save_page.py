#!/usr/bin/env python3
"""Save page HTML for inspection. Run: python save_page.py"""

from pathlib import Path
from playwright.sync_api import sync_playwright

URL = "https://www.tel-aviv.gov.il/Residents/Education/Pages/daycare.aspx"
OUT = Path(__file__).parent / "debug" / "daycare_page.html"

def main():
    Path(OUT).parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(URL, wait_until="networkidle", timeout=30000)
        import time; time.sleep(3)
        html = page.content()
        OUT.write_text(html, encoding="utf-8")
        browser.close()
    print(f"Saved to {OUT}")

if __name__ == "__main__":
    main()
