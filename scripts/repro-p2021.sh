#!/usr/bin/env bash
# Воспроизведение инцидента «500 на /admin/leads» (07.10.2026):
# имитация окружения пользователя — БД в состоянии Б-эры (без таблиц
# воронки Lead/QuoteOption), код В-эры. Ожидаем Prisma P2021.
set -u
cd /home/z/my-project

ST=.staging/p2021
mkdir -p "$ST"
cp db/custom.db "$ST/custom.db"

# Имена таблиц — как их создал Prisma (без @@map, чувствительны к регистру)
python3 - "$ST/custom.db" <<'PY'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
print("[repro] таблицы до:", ", ".join(sorted(tables)))
for t in ("Lead", "QuoteOption"):
    if t in tables:
        con.execute(f'DROP TABLE "{t}"')
        print(f"[repro] DROP TABLE {t}")
con.commit()
left = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
print("[repro] таблицы после:", ", ".join(sorted(left)))
con.close()
PY

# Тот же запрос, что делает GET /api/admin/leads, тем же сгенерированным
# клиентом — изолированно от приложения.
DATABASE_URL="file:/home/z/my-project/$ST/custom.db" \
node --input-type=module -e '
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
try {
  await p.lead.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      options: { orderBy: { createdAt: "asc" } },
      order: { select: { id: true, number: true } },
    },
  });
  console.log("[repro] НЕ ОЖИДАННО: запрос прошёл");
} catch (e) {
  console.log("[repro] ИМЯ:", e.constructor?.name);
  console.log("[repro] КОД:", e.code ?? "(нет)");
  console.log("[repro] СООБЩЕНИЕ:", String(e.message).split("\n")[0]);
  process.exitCode = 0;
} finally {
  await p.$disconnect();
}
'
