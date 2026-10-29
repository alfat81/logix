/**
 * DF-17C: импорт справочника ТН ВЭД в HsCode + журнал HsImport.
 *
 * Данные — scripts/ref-data/hs/tnved-tws.json (снапшот открытой выгрузки
 * tws.by/tws/tnved/download/excel, версия = дата данных источника;
 * источник и условия — docs/REFERENCES-SOURCES.md, раздел hs).
 * Единственный импортёр этих данных (аналог IC-16 для RefItem).
 *
 * Идемпотентность (карточка DF-17C: «импорт повторно не дублирует»):
 *  • та же редакция — записи не пишутся, журнал сверяется;
 *  • новая — записи добавляются, предыдущая редакция ЗАКРЫВАЕТСЯ
 *    (validTo = дата новой), ничего не удаляется: старые сделки хранят
 *    код и редакцию, по которой он выбран (история действия);
 *  • редакция старее существующей — отказ (защита истории).
 *
 * Запуск: npx tsx scripts/import-hs.ts
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'
import { planHsImport } from '../src/lib/hs'

// ── Тот же фолбэк .env, что в seed.ts (Prisma Client сам грузит .env,
//    но при запуске через tsx гарантируем переменные) ─────────────────
import './env-fallback'

type HsSnapshot = {
  version: string
  source: string
  sourceName?: string
  disclaimer?: string
  level: number
  items: { code: string; name: string; etdDutyText: string | null }[]
}

function loadSnapshot(): HsSnapshot {
  const path = join(process.cwd(), 'scripts', 'ref-data', 'hs', 'tnved-tws.json')
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as HsSnapshot
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.version)) {
    throw new Error(`Снапшот: некорректная версия «${raw.version}» (ждём YYYY-MM-DD)`)
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new Error('Снапшот: пустой список позиций')
  }
  const codes = new Set<string>()
  for (const it of raw.items) {
    if (!/^\d{10}$/.test(it.code)) throw new Error(`Снапшот: код не 10 цифр: ${it.code}`)
    if (codes.has(it.code)) throw new Error(`Снапшот: дубль кода ${it.code}`)
    if (!it.name || it.name.trim() === '') throw new Error(`Снапшот: пустое имя у ${it.code}`)
    codes.add(it.code)
  }
  return raw
}

const prisma = new PrismaClient()

async function main(): Promise<void> {
  const snap = loadSnapshot()
  console.log(
    `Импорт ТН ВЭД: редакция ${snap.version}, позиций ${snap.items.length} (${snap.sourceName ?? snap.source})`
  )

  const known = await prisma.hsImport.findMany({ select: { version: true } })
  const plan = planHsImport(known.map((k) => k.version), snap.version)

  if (plan === 'same') {
    const log = await prisma.hsImport.findUnique({ where: { version: snap.version } })
    const stored = await prisma.hsCode.count({ where: { sourceRev: snap.version } })
    if (stored !== snap.items.length) {
      throw new Error(
        `Редакция ${snap.version} уже импортирована, но позиций в БД ${stored}, в снапшоте ${snap.items.length} — данные разошлись, разберитесь вручную`
      )
    }
    console.log(
      `  = Редакция ${snap.version} уже в базе (${stored} позиций, журнал от ${log?.importedAt?.toISOString() ?? '—'}) — повторный импорт ничего не изменил`
    )
    return
  }
  if (plan === 'older') {
    console.error(
      [
        `Импорт ОТМЕНЁН: редакция ${snap.version} старее уже существующей (${known
          .filter((k) => k.version > snap.version)
          .join(', ')}).`,
        'История действия не переписывается задним числом (карточка DF-17C).',
        'Если это осознанный откат — разберите ситуацию вручную.',
      ].join('\n')
    )
    process.exit(1)
  }

  const revDate = new Date(`${snap.version}T00:00:00Z`)

  await prisma.$transaction(async (tx) => {
    // Новая редакция: вставка листовых позиций (level = 10 — выгрузка
    // содержит только их; иерархия 2/4/6 восстанавливается префиксом).
    await tx.hsCode.createMany({
      data: snap.items.map((it) => ({
        code: it.code,
        name: it.name,
        level: snap.level,
        unit: null, // доп. единицы в выгрузке нет — доезжает из PDF позже
        etdDutyText: it.etdDutyText,
        validFrom: revDate,
        validTo: null,
        sourceRev: snap.version,
      })),
      skipDuplicates: true,
    })
    // Закрыть предыдущие редакции: окно действия обрывается датой новой.
    // Ничего не удаляем — старые сделки ссылаются на свои редакции.
    const closed = await tx.hsCode.updateMany({
      where: { sourceRev: { not: snap.version }, validTo: null },
      data: { validTo: revDate },
    })
    await tx.hsImport.upsert({
      where: { version: snap.version },
      create: { version: snap.version, source: snap.source, itemCount: snap.items.length },
      update: { source: snap.source, itemCount: snap.items.length },
    })
    console.log(`  + Вставлено ${snap.items.length} позиций (редакция ${snap.version})`)
    console.log(`  ~ Закрыто записей предыдущих редакций: ${closed.count}`)
  })

  console.log('Готово: справочник ТН ВЭД актуализирован, история сохранена.')
}

main()
  .catch((e) => {
    console.error('Импорт ТН ВЭД упал:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
