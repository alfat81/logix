#!/usr/bin/env python3
"""Реплицирует логику IC-14 (окна 12 строк, без комментариев) для пары файлов."""
import re, sys, hashlib

files = [
    "src/app/api/admin/leads/[id]/brokers/[brokerId]/route.ts",
    "src/app/api/admin/orders/[id]/brokers/[brokerId]/route.ts",
]
def norm(path):
    out = []
    for l in open(path, encoding="utf-8"):
        s = l.strip()
        if s and not s.startswith(("//", "*", "/*")):
            out.append(s)
    return out

a, b = norm(files[0]), norm(files[1])
# ищем общие подстроки окон длины 12
wa = set()
for i in range(len(a) - 11):
    wa.add("\n".join(a[i:i+12]))
for j in range(len(b) - 11):
    w = "\n".join(b[j:j+12])
    if w in wa:
        print("=== СОВПАВШЕЕ ОКНО ===")
        print(w)
        print("======================")
        sys.exit(0)
print("Совпадений окон 12 нет — проверю 10-11")
for n in (11, 10):
    wa = set()
    for i in range(len(a) - n + 1):
        wa.add("\n".join(a[i:i+n]))
    for j in range(len(b) - n + 1):
        w = "\n".join(b[j:j+n])
        if w in wa:
            print(f"=== ОКНО {n} ==="); print(w); sys.exit(0)
print("даже 10 нет")
