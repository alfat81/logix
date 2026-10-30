#!/usr/bin/env python3
# DF-20 (D40): IC-17 — контраст и красный сигнал (BRANDBOOK v1.3, RULES 2.14).
# Источники: токены src/app/globals.css (только :root, светлой темы) и пары
# docs/design/contrast-pairs.json (обязательный минимум карточки DF-20).
# Части проверки:
#   1) пары «текст/фон» и «иконка/фон» проходят WCAG AA (≥ 4,5 текст, ≥ 3 ui);
#   2) в src нет текста мельче 12 px (text-[10px], text-[11px], text-xxs);
#   3) логотип и навигация (LOGO_NAV_FILES) не используют красный сигнал
#      как текст/рамку (bg-primary разрешён: счётчик навигации — семантика
#      основной кнопки, пара Ink-on-Coral).
# Храповик — через integrity_check.py (IC-17 в CHECKS). Отдельный прогон:
#   python3 scripts/contrast_check.py   # код возврата ≠ 0 при находках
# Самопроверка формул — на эталонных значениях карточки: белый на Coral
# 2,36; Ink на Coral 6,09; белый на Brick-strong 4,97 (допуск ±0,02).

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GLOBALS = ROOT / "src" / "app" / "globals.css"
PAIRS = ROOT / "docs" / "design" / "contrast-pairs.json"

# Файлы логотипа и навигации (часть 3). Лендинг src/app/page.tsx НЕ входит:
# публичный сайт — задача P4-01, им управляет §9 брендбука v1.2.
LOGO_NAV_FILES = [
    "src/app/admin/(dashboard)/layout.tsx",
    "src/components/admin/AdminNav.tsx",
    "src/app/client/(portal)/layout.tsx",
    "src/app/contractor/(portal)/layout.tsx",
]
RED_SIGNAL_CLASSES = re.compile(
    r"text-primary(?![-\w])|text-coral(?![-\w])|text-brick-strong|text-brick(?![-\w])|"
    r"text-destructive(?![-\w])|border-primary(?![-\w])|border-destructive(?![-\w])|"
    r"bg-brick(?![-\w])|bg-coral(?![-\w])"
)
SMALLTEXT = re.compile(r"text-\[(?:10|11)(?:\.\d+)?px\]|text-xxs")
SCAN_ROOTS = ["src/app", "src/components"]


def _srgb_channel(c: float) -> float:
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _srgb_channel(r) + 0.7152 * _srgb_channel(g) + 0.0722 * _srgb_channel(b)


def contrast_ratio(fg: str, bg: str) -> float:
    l1, l2 = sorted((luminance(fg), luminance(bg)), reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)


def load_tokens() -> dict[str, str]:
    """Hex-токены из :root globals.css; var(--x) разворачивается по цепочке."""
    text = GLOBALS.read_text(encoding="utf-8")
    block = re.search(r":root \{(.*?)\n\}", text, re.S)
    if not block:
        raise ValueError("globals.css: не найден блок :root")
    raw = dict(re.findall(r"--([\w-]+):\s*([^;]+);", block.group(1)))

    def resolve(name: str, depth: int = 0) -> str | None:
        if depth > 8:
            raise ValueError(f"globals.css: цикл ссылок токенов у --{name}")
        value = raw[name].strip()
        m = re.fullmatch(r"var\(--([\w-]+)\)", value)
        if m:
            return resolve(m.group(1), depth + 1)
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", value):
            return None  # не цвет (радиусы, шрифты) — пары его не используют
        return value

    return {n: v for n in raw if (v := resolve(n)) is not None}


def self_test() -> list[tuple[str, str]]:
    """Эталонные значения карточки DF-20; расхождение — ошибка формул."""
    known = [
        ("white-on-coral", "#FFFFFF", "#F28C8C", 2.36),
        ("ink-on-coral", "#2B2A26", "#F28C8C", 6.09),
        ("white-on-brick-strong", "#FFFFFF", "#BF4A27", 4.97),
    ]
    problems: list[tuple[str, str]] = []
    for key, fg, bg, expected in known:
        got = contrast_ratio(fg, bg)
        if abs(got - expected) > 0.02:
            problems.append((key, f"контраст {fg} на {bg}: {got:.2f}, эталон {expected}"))
    # Логика порогов: заведомо плохая пара (Coral-текст на White, 2,36)
    # обязана падать ниже AA 4,5, хорошая (Ink на White) — проходить.
    bad = contrast_ratio("#F28C8C", "#FFFFFF")
    good = contrast_ratio("#2B2A26", "#FFFFFF")
    if not (bad < 4.5 <= good):
        problems.append(("thresholds", f"пороговая логика: bad={bad:.2f}, good={good:.2f}"))
    return problems


def check_pairs() -> list[tuple[str, str]]:
    spec = json.loads(PAIRS.read_text(encoding="utf-8"))
    tokens = load_tokens()
    problems: list[tuple[str, str]] = []

    def color(ref: str) -> str:
        return tokens[ref.lstrip("-")] if ref.startswith("--") else ref

    for p in spec["pairs"]:
        fg, bg = color(p["fg"]), color(p["bg"])
        minimum = float(p.get("min", spec["min_ui"] if p["kind"] == "ui" else spec["min_text"]))
        ratio = contrast_ratio(fg, bg)
        if ratio + 1e-9 < minimum:
            problems.append(
                (f"pair:{p['fg']}-on-{p['bg']}", f"{p.get('why', '')}: {ratio:.2f} < {minimum}")
            )
    return problems


def check_smalltext() -> list[tuple[str, str]]:
    problems: list[tuple[str, str]] = []
    for root in SCAN_ROOTS:
        for f in sorted((ROOT / root).rglob("*.tsx")):
            for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
                if SMALLTEXT.search(line):
                    problems.append(
                        (f"smalltext:{f.relative_to(ROOT).as_posix()}:{i}",
                         "текст мельче 12 px (RULES 2.14 / BRANDBOOK v1.3): замените на text-xs"),
                    )
    return problems


def check_red_signal() -> list[tuple[str, str]]:
    problems: list[tuple[str, str]] = []
    for rel in LOGO_NAV_FILES:
        f = ROOT / rel
        if not f.exists():
            problems.append((f"red-signal:{rel}", "файл логотипа/навигации не найден (список устарел)"))
            continue
        for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            m = RED_SIGNAL_CLASSES.search(line)
            if m:
                problems.append(
                    (f"red-signal:{rel}:{i}",
                     f"красный сигнал «{m.group(0)}» в логотипе/навигации (BRANDBOOK v1.3)"),
                )
    return problems


def main() -> int:
    findings = self_test() + check_pairs() + check_smalltext() + check_red_signal()
    for key, detail in findings:
        print(f"IC-17\t{key}\t{detail}")
    print(f"contrast_check: {len(findings)} находок")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
