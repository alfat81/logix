#!/usr/bin/env python3
# Восстановление .scope-baseline.json из релизного zip (урок DF-00C:
# scope init нельзя снимать ПОСЛЕ правок — базлайн берут из последнего
# выпущенного архива). Использует excluded() из scope.py как источник истины.
import hashlib
import importlib.util
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE = ROOT / ".scope-baseline.json"

spec = importlib.util.spec_from_file_location("scope", ROOT / "scripts" / "scope.py")
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python3 scripts/scope_baseline_from_zip.py <logix-vX.Y.Z.zip>")
        return 2
    zip_path = Path(sys.argv[1])
    if not zip_path.exists():
        print(f"нет архива: {zip_path}")
        return 2
    out: dict[str, str] = {}
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            p = ROOT / name
            if scope.excluded(p) or not p.name:
                continue
            rel = Path(name).as_posix()
            out[rel] = hashlib.sha256(z.read(name)).hexdigest()
    BASELINE.write_text(json.dumps(out, indent=1, sort_keys=True), encoding="utf-8")
    print(f"scope init из zip: {len(out)} файлов -> {BASELINE.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
