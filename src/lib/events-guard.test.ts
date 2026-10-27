import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ─── DF-01 «События как ось»: охранный тест ─────────────────────────
// Инвариант единственной точки записи (§1.3 ROADMAP-DEALFLOW): событие
// сделки пишется ТОЛЬКО через emitEvent() (lib/events.ts) — формат
// актёра, аудитория из реестра EVENT_TYPES и синхрон isInternal живут
// в одном месте, а не в пятнадцати. Тест текстовый (как
// permissions-guard): падает при появлении прямого db.activity.create,
// прямого db.notification.create (задел под DF-03) или новых вызовов
// deprecated-обёртки logActivity вне замороженного контура подрядчика.
// Дополнение (шаг 6 карточки DF-01): любой читатель ленты обязан
// фильтровать через eventWhereFor() — копировать where-фрагменты
// вручную запрещено.

// Скан src/**: *.ts/*.tsx, кроме самих тестов.
function findSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...findSourceFiles(full))
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    ) {
      files.push(full)
    }
  }
  return files
}

// Относительный путь с прямыми слэшами (независимо от ОС).
function rel(file: string): string {
  return path.relative(process.cwd(), file).split(path.sep).join('/')
}

describe('Events Guard (DF-01)', () => {
  const srcDir = path.resolve(process.cwd(), 'src')
  const files = findSourceFiles(srcDir)
  expect(files.length).toBeGreaterThan(0)

  it('db.activity.create — только в lib/events.ts (emitEvent) и lib/activity.ts (logInternalNote)', () => {
    // lib/activity.ts — вторая легитимная точка: logInternalNote пишет
    // заметку-самодействие (возврат строки, ошибки пробураливаются —
    // иная семантика, чем у наблюдения-события; решение G2, Блок 2).
    const allowed = new Set(['src/lib/activity.ts', 'src/lib/events.ts'])
    const offenders = files.filter(
      (f) => /activity\.create\(/.test(fs.readFileSync(f, 'utf-8')) && !allowed.has(rel(f))
    )
    expect(
      offenders.map(rel),
      `прямой db.activity.create вне ${[...allowed]} — пишите через emitEvent()`
    ).toEqual([])
  })

  it('db.notification.create — нигде (уведомления появятся в DF-03 через свой модуль)', () => {
    // Задел под DF-03: когда появится модель Notification и диспетчер
    // писем, его модуль добавляется сюда ЕДИНСТВЕННЫМ разрешённым —
    // как activity.create выше, а не рассыпается по роутам.
    const offenders = files.filter((f) => /notification\.create\(/.test(fs.readFileSync(f, 'utf-8')))
    expect(offenders.map(rel), 'прямой db.notification.create запрещён до DF-03').toEqual([])
  })

  it('logActivity( — только определение-обёртка и замороженный роут подрядчика (D31)', () => {
    // Обёртка @deprecated существует ради непереведённого замороженного
    // контура (FROZEN.md, D31). Новый код обязан звать emitEvent() —
    // появление logActivity( в любом другом файле = регресс перевода.
    const allowed = new Set([
      'src/lib/activity.ts',
      'src/app/api/contractor/orders/[id]/stages/[stageId]/route.ts',
    ])
    const offenders = files.filter(
      (f) => /logActivity\(/.test(fs.readFileSync(f, 'utf-8')) && !allowed.has(rel(f))
    )
    expect(
      offenders.map(rel),
      'logActivity() вне разрешённых файлов — используйте emitEvent() из @/lib/events'
    ).toEqual([])
  })

  it('читатели ленты фильтруют через eventWhereFor, а не копируют where вручную', () => {
    // Любой файл, читающий Activity (прямым findMany или вложенным
    // include `activities: {`), обязан упоминать eventWhereFor —
    // единственную точку расчёта видимости (lib/audience.ts). Для
    // staff это пустой фрагмент, для client/broker — аудитория +
    // isInternal:false; «догадаться потом» дороже заложенного инварианта.
    const readerRegex = /activity\.findMany|activities:\s*\{/
    const offenders = files.filter((f) => {
      const content = fs.readFileSync(f, 'utf-8')
      return readerRegex.test(content) && !content.includes('eventWhereFor')
    })
    expect(
      offenders.map(rel),
      'чтение Activity без eventWhereFor() — фильтр аудитории берётся из @/lib/audience'
    ).toEqual([])
  })
})
