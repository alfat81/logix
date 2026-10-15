const fs = require("fs")
try { for (const l of fs.readFileSync(".env", "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2] } } catch {}
const { PrismaClient } = require("@prisma/client")
const { scryptSync, timingSafeEqual } = require("crypto")
const prisma = new PrismaClient()
const candidates = process.argv.length > 2 ? process.argv.slice(2) : ["Logix-QTLbcKe06OJOl3sm", "logix-master"]
const url = process.env.DATABASE_URL || "(DATABASE_URL не найден)"
const host = (url.match(/@([^/?]+)/) || [])[1] || url
const fits = (stored, plain) => { const [, s, h] = stored.split(":"); const a = scryptSync(plain, s, 64); const b = Buffer.from(h, "hex"); return a.length === b.length && timingSafeEqual(a, b) }
;(async () => {
  console.log("Хост базы:", host)
  console.log("Кандидаты:", candidates.join(" | "))
  const rows = await prisma.employee.findMany({ select: { phone: true, name: true, password: true }, orderBy: { phone: "asc" } })
  if (!rows.length) { console.log("Сотрудников НЕТ — приложение смотрит не в ту базу."); return }
  for (const e of rows) {
    if (!e.password.startsWith("scrypt:")) { console.log(e.phone, "— хэш не scrypt"); continue }
    const ok = candidates.filter((c) => fits(e.password, c))
    console.log(e.phone, "—", ok.length ? "ПОДХОДИТ: " + ok.join(", ") : "ни один кандидат не подошёл")
  }
})().catch((e) => { console.error("ОШИБКА:", String(e.message).slice(0, 300)); process.exitCode = 1 }).finally(() => prisma.$disconnect())
