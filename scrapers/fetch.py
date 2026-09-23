"""Turns a fee page (HTML, PDF or JavaScript-built page) into plain text."""

from __future__ import annotations

import io
import re
import time

import requests
from bs4 import BeautifulSoup

USER_AGENT = (
    "FinexisEduFeeBot/1.0 (+https://github.com/minemine-afk/finexisedu; "
    "checks published tuition fees about once a month)"
)
TIMEOUT = 30


def normalise(text: str) -> str:
    """Collapse whitespace and non-breaking spaces so regexes can match across line breaks."""
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    return normalise(soup.get_text(" "))


def pdf_to_text(data: bytes) -> str:
    import pdfplumber

    with pdfplumber.open(io.BytesIO(data)) as pdf:
        return normalise(" ".join(page.extract_text() or "" for page in pdf.pages))


def browser_to_text(url: str) -> str:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page(user_agent=USER_AGENT)
            page.goto(url, wait_until="networkidle", timeout=TIMEOUT * 1000)
            return html_to_text(page.content())
        finally:
            browser.close()


def _get(url: str, attempts: int = 3) -> requests.Response:
    """GET with a short retry on dropped connections, which some university servers do."""
    for attempt in range(1, attempts + 1):
        try:
            res = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
            res.raise_for_status()
            return res
        except (requests.ConnectionError, requests.Timeout):
            if attempt == attempts:
                raise
            time.sleep(2 * attempt)
    raise AssertionError("unreachable")


def fetch_text(url: str, parser: str) -> str:
    if parser == "browser":
        return browser_to_text(url)
    res = _get(url)
    if parser == "pdf":
        return pdf_to_text(res.content)
    return html_to_text(res.text)
