#!/usr/bin/env python3
"""Скачать IBM Plex Sans (400/500/700) с fonts.googleapis.com и переписать CSS на локальные пути."""
import re
import urllib.request
from pathlib import Path

OUT = Path("/home/z/my-project/download/DOC-CENTER/mockups/fonts")
OUT.mkdir(parents=True, exist_ok=True)

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
CSS_URL = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;700&display=swap"

req = urllib.request.Request(CSS_URL, headers={"User-Agent": UA})
css = urllib.request.urlopen(req, timeout=20).read().decode("utf-8")

# Разбиваем на блоки @font-face и оставляем только кириллицу/латиницу (макеты на русском).
blocks = re.findall(r"/\*\s*([a-z-]+)\s*\*/\s*(@font-face\s*\{[^}]+\})", css)
kept = []
n = 0
for subset, block in blocks:
    if subset not in ("cyrillic", "cyrillic-ext", "latin", "latin-ext"):
        continue
    m = re.search(r"url\((https://[^)]+\.woff2)\)", block)
    if not m:
        continue
    url = m.group(1)
    weight = re.search(r"font-weight:\s*(\d+)", block).group(1)
    fname = f"plex-{weight}-{subset}.woff2"
    dest = OUT / fname
    if not dest.exists():
        r = urllib.request.Request(url, headers={"User-Agent": UA})
        dest.write_bytes(urllib.request.urlopen(r, timeout=20).read())
    kept.append(block.replace(url, f"fonts/{fname}"))
    n += 1

(OUT / "ibm-plex-sans.css").write_text("\n".join(kept), encoding="utf-8")
print(f"OK: {n} font-face, файлов {len(list(OUT.glob('*.woff2')))}")
