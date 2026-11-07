#!/usr/bin/env python3
"""Диагностика IC-14: показать совпавшее 12-строчное окно для пары файлов."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def norm(p: Path) -> list[str]:
    src = p.read_text(encoding="utf-8")
    out = []
    for l in src.splitlines():
        s = l.strip()
        if s and not s.startswith(("//", "*", "/*")):
            out.append(s)
    return out


def windows(lines: list[str]) -> dict[str, int]:
    d = {}
    for i in range(len(lines) - 11):
        h = "\n".join(lines[i : i + 12])
        d[h] = i
    return d


def main() -> None:
    a, b = (ROOT / sys.argv[1]), (ROOT / sys.argv[2])
    wa, wb = windows(norm(a)), windows(norm(b))
    common = set(wa) & set(wb)
    print(f"совпавших окон: {len(common)}")
    for h in list(common)[:5]:
        print("---- окно в", sys.argv[1], "строка(норм.)", wa[h] + 1, "----")
        for line in h.splitlines():
            print("  ", line)
        print("---- окно в", sys.argv[2], "строка(норм.)", wb[h] + 1, "----")


if __name__ == "__main__":
    main()
