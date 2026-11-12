#!/usr/bin/env python3
"""TU-01.2 (V-1/D79): воспроизводимая сборка локальных woff2 IBM Plex Sans/Mono.

Источник — TTF репозитория google/fonts (зеркало jsdelivr). Источник
ЗАКРЕПЛЕН sha256-константами ниже: скрипт сверяет скачанные байты и
отказывается работать при расхождении (drift источника = ошибка).
Пути — относительные от корня репозитория (скрипт не привязан к
абсолютному расположению песочницы — замечание 5 владельца).

Конвейер на вес: varLib.instancer (wdth=100) → pyftsubset
(latin + cyrillic + пунктуация + ₽/№/×/минус/стрелки) → woff2.
Один файл на вес содержит ОБА сабсета — next/font/local подключает
без unicode-range; сборка приложения не зависит от Google Fonts.

Воспроизводимость: нужен python3 + fonttools>=4.62 + brotli (pip);
выход зависит только от (исходник, fonttools) — версии инструментов
зафиксируйте requirements-файлом при переносе на другую машину.
"""
import hashlib
import io
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

# Детерминизм: fontTools instancer итерирует множества имён — при
# рандомизированном хеше Python выход меняется от запуска к запуску.
# Фиксируем хеш-сид (перезапуск процесса, если сид не задан).
if os.environ.get("PYTHONHASHSEED") != "0":
    os.environ["PYTHONHASHSEED"] = "0"
    os.execv(sys.executable, [sys.executable] + sys.argv)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "fonts"
OUT.mkdir(parents=True, exist_ok=True)

BASE = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl"

# Источник закреплён: sha256 скачанных TTF (снято 12.11.2026,
# google/fonts main). При обновлении источника — обновить константы
# осознанно и прогнать сборку заново.
SOURCES = {
    "IBMPlexSans": {
        "url": f"{BASE}/ibmplexsans/IBMPlexSans%5Bwdth%2Cwght%5D.ttf",
        "sha256": "3b031aa4216174205bd8471f88a49b91f093169e9e87bd5262242bc5967fe2e3",
        "weights": ["400", "500", "600", "700"],  # переменный TTF (wdth, wght)
    },
    "IBMPlexMono": {
        "url": None,  # статические TTF по весам (у mono нет переменного файла)
        "sha256": None,
        "weights": {
            "400": (f"{BASE}/ibmplexmono/IBMPlexMono-Regular.ttf",
                    "6a3412f058c7d8dfd9170c41e85ade48e5156ecb89356110ca57a0a27734af46"),
            "500": (f"{BASE}/ibmplexmono/IBMPlexMono-Medium.ttf",
                    "a9b4c49bb299e05b5f6c481e7fb5e78943d2793249a0c8874ab574a2d1ea6755"),
            "600": (f"{BASE}/ibmplexmono/IBMPlexMono-SemiBold.ttf",
                    "d3c38e55c78f5b0f28009fddba4834ec503278936a5986032424c9bd2d23aa46"),
        },
    },
}

UNICODES = (
    "U+0000-00FF,U+0400-04FF,U+2000-206F,U+20AC,U+20BD,U+2116,"
    "U+2212,U+2190-2193,U+2070-2079,U+2080-2089"
)


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "logix-tu01/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def verify(data: bytes, expected: str, label: str) -> None:
    actual = hashlib.sha256(data).hexdigest()
    if actual != expected:
        raise SystemExit(
            f"FAIL: {label}: sha256 источника изменился ({actual[:12]}… ≠ {expected[:12]}…). "
            "Источник закреплён константой — обновите её осознанно после проверки."
        )


def instance(var_ttf: bytes, weight: str) -> bytes:
    from fontTools import ttLib
    from fontTools.varLib import instancer

    f = ttLib.TTFont(io.BytesIO(var_ttf))
    axes = {a.axisTag: a for a in f["fvar"].axes}
    pin = {"wght": float(weight)}
    if "wdth" in axes:
        pin["wdth"] = 100.0
    instancer.instantiateVariableFont(f, pin, inplace=True, updateFontNames=False)
    # Детерминизм: ttLib по умолчанию (recalcTimestamp=True) проставляет
    # текущее время в head.modified при КАЖДОМ сохранении — выход менялся
    # от запуска к запуску. Отключаем пересчёт и фиксируем дату нулём.
    f.recalcTimestamp = False
    f["head"].modified = 0
    buf = io.BytesIO()
    f.save(buf)
    return buf.getvalue()


def subset_to_woff2(ttf: bytes) -> bytes:
    src = OUT / "_subset_src.ttf"
    dst = OUT / "_subset_out.woff2"
    src.write_bytes(ttf)
    cmd = [
        sys.executable, "-m", "fontTools.subset", str(src),
        f"--unicodes={UNICODES}",
        "--layout-features=*", "--flavor=woff2",
        f"--output-file={dst}",
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    result = dst.read_bytes()
    src.unlink()
    dst.unlink()
    return result


def main() -> None:
    for family, spec in SOURCES.items():
        if spec["url"] is not None:
            raw = fetch(spec["url"])
            verify(raw, spec["sha256"], f"{family} (variable)")
            print(f"{family}: переменный TTF {len(raw) // 1024} KiB — sha256 OK")
            statics = {w: instance(raw, w) for w in spec["weights"]}
        else:
            statics = {}
            for w, (url, expected) in sorted(spec["weights"].items()):
                data = fetch(url)
                verify(data, expected, f"{family}-{w}")
                statics[w] = data
            print(f"{family}: статические TTF {', '.join(statics)} — sha256 OK")
        for w, static in sorted(statics.items()):
            woff2 = subset_to_woff2(static)
            target = OUT / f"{family}-{w}.woff2"
            target.write_bytes(woff2)
            print(f"  {target.name}: {len(woff2) // 1024} KiB")
    print("Готово. Файлы в src/fonts/, лицензия OFL — src/fonts/OFL-IBMPlex.txt")


if __name__ == "__main__":
    main()
