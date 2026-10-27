#!/usr/bin/env python3
"""
Сборка релизного архива Logix (docs/RULES.md 2.16, решение D12).

Запускает АГЕНТ в своём рабочем дереве после полного зелёного прогона
(tsc, lint, vitest, build, e2e). Скрипт НЕ прогоняет проверки сам —
он упаковывает уже проверенное состояние.

  python3 scripts/build-release.py            # версия из package.json
  python3 scripts/build-release.py --out DIR  # куда положить архив

Результат:
  logix-vX.Y.Z.zip           — полный снапшот дерева (без мусора и секретов)
  sha256-сумма архива        — печатается в конце для трассировки

Исключения: секреты (.env* кроме .env.example), артефакты сборки
(.next, node_modules, *.tsbuildinfo, next.log), локальные каталоги
(releases, .git). Владелец распаковывает архив в свой клон с заменой
(Expand-Archive -Force) — .env владельца остаётся нетронутым.
"""
import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Каталоги, которые не должны попадать в архив ни при каких условиях.
# («releases» в корне отсекается отдельно в is_excluded — каталог вывода;
# docs/releases/ — часть репо и едет в архиве.)
EXCLUDE_DIRS = {
    ".git", ".next", "node_modules", "__pycache__",
    ".turbo", ".vercel", ".zscripts", "skills", "upload", "download",
    "examples", ".pytest_cache", ".venv",
    # локальные бинари/данные PostgreSQL песочницы (provision_pg.sh, 247 МБ)
    ".pg",
}

# Файлы-мусор и СЕКРЕТЫ. .env.* исключены намеренно: в клоне владельца
# свои значения, а агентские секреты в архив попадать не должны.
EXCLUDE_FILES = {
    ".env", ".env.local", ".env.production", "next.log", ".DS_Store",
    "tsconfig.tsbuildinfo", "bun.lockb.tmp", ".scope-baseline.json",
}
EXCLUDE_SUFFIXES = (".log", ".tsbuildinfo")
# Исключение из исключения: пример env-переменных едет в архиве.
ALLOW = {".env.example"}

RELEASES_DIR = ROOT / "docs" / "releases"


def is_excluded(rel: Path) -> bool:
    # «releases» исключаем только в КОРНЕЕ репо (каталог вывода архива),
    # но не docs/releases/ — релизные документы едут в архиве.
    if rel.parts[0] == "releases":
        return True
    if any(part in EXCLUDE_DIRS for part in rel.parts):
        return True
    if rel.name in EXCLUDE_FILES and rel.name not in ALLOW:
        return True
    if rel.name.endswith(EXCLUDE_SUFFIXES) and rel.name not in ALLOW:
        return True
    return False


def collect_files() -> list[Path]:
    out: list[Path] = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT)
        if is_excluded(rel):
            continue
        out.append(rel)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Сборка релизного архива Logix")
    parser.add_argument("--out", default=str(ROOT / "releases"), help="каталог для архива")
    args = parser.parse_args()

    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]

    # Гейт G3/G4 (DF-00B, D30): релиз не собирается при красном integrity/knip.
    import subprocess
    for gate in ("integrity_check.py", "knip_check.py"):
        print(f"── Гейт: python3 scripts/{gate} ──")
        r = subprocess.run([sys.executable, str(ROOT / "scripts" / gate)], cwd=ROOT)
        if r.returncode != 0:
            print(f"ОШИБКА: {gate} красный — архив не собирается (храповик, D30)")
            return 1

    notes = RELEASES_DIR / f"RELEASE-NOTES-v{version}.md"
    instructions = RELEASES_DIR / f"RELEASE-INSTRUCTIONS-v{version}.md"
    missing = [str(p.relative_to(ROOT)) for p in (notes, instructions) if not p.exists()]
    if missing:
        print("ОШИБКА: нет релизных документов — сначала напиши их:")
        for m in missing:
            print("  -", m)
        return 1

    files = collect_files()
    # Санити-проверки: секреты и мусор не должны просочиться;
    # релизные документы обязаны попасть в архив.
    forbidden = [f for f in files if f.name == ".env" or f.name == "next.log"]
    if forbidden:
        print("ОШИБКА: в список попали исключённые файлы:", forbidden)
        return 1
    required = [notes.relative_to(ROOT), instructions.relative_to(ROOT)]
    absent = [str(r) for r in required if r not in files]
    if absent:
        print("ОШИБКА: релизные документы НЕ попали в архив:", absent)
        return 1

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    zip_path = out_dir / f"logix-v{version}.zip"

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for rel in files:
            zf.write(ROOT / rel, str(rel))

    digest = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    size_kb = zip_path.stat().st_size / 1024
    print(f"Архив: {zip_path}")
    print(f"Файлов в архиве: {len(files)}")
    print(f"Размер: {size_kb:.0f} КБ")
    print(f"SHA-256: {digest}")
    print()
    print("Перед передачей владельцу убедись, что прогон зелёный:")
    print("  bunx tsc --noEmit && bun run lint && bun run test && bun run build")
    print("  + e2e на тестовой БД (scripts/e2e_api_test.py)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
