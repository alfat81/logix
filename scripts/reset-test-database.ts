/**
 * TU-01: безопасная очистка тестовой базы Logix (reset-test-database).
 *
 * ТЗ: полная очистка тестовой базы от пользовательских и тестовых данных
 * с сохранением мастер-аккаунта (с TOTP и кодами восстановления),
 * системных справочников и глобальных настроек. Структура БД не меняется:
 * никаких DROP, db:push и миграций — только SELECT/DELETE внутри
 * транзакции с откатом при ошибке.
 *
 * Режимы:
 *   npx tsx scripts/reset-test-database.ts --dry-run   — отчёт, ничего не меняет
 *   npx tsx scripts/reset-test-database.ts --clean     — фактическая очистка
 *   npx tsx scripts/reset-test-database.ts --retry-pending <файл> — довыработка файлов
 *
 * Предохранители (ТЗ §5Б/§6):
 *   - имя базы обязано входить в RESET_DB_ALLOWED (через запятую) — без
 *     переменной очистка невозможна в принципе;
 *   - имя базы/хост с «prod» — жёсткий отказ в любом режиме;
 *   - ровно один мастер (roles содержит "master"), иначе отказ без удаления;
 *   - сверка перечня таблиц с инвентаризацией: неизвестные/недостающие
 *     таблицы и отсутствующие критичные колонки — отказ;
 *   - очистка только в интерактивном терминале (TTY) после ввода фразы
 *     подтверждения; в CI (CI=true) и без TTY — отказ;
 *   - двойная проверка: анализ до подтверждения и повторный после — при
 *     расхождении счётчиков запуск отменяется;
 *   - удаление — одна транзакция (interactive transaction с таймаутом),
 *     при ошибке полный откат; файлы хранилища удаляются ТОЛЬКО после
 *     успешного коммита (двухфазная схема, ТЗ §7);
 *   - секреты и строки подключения в лог/отчёт не выводятся: только
 *     замаскированный URL и хеш строки подключения (12 hex).
 *
 * Классификация таблиц — по фактической схеме prisma/schema.prisma
 * (49 таблиц, инвентаризация см. RESET-DB-INVENTORY.xlsx поставки).
 * Манифест ниже — источник правды скрипта; расхождение с БД = отказ.
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { PrismaClient, Prisma } from '@prisma/client'
// Мини-загрузчик .env — общий с seed.ts/import-hs.ts (reuse-first 2.13).
import './env-fallback'
// Единый драйвер хранилища приложения (S3-совместимое или локальный
// каталог): удаляем объекты тем же кодом, которым их загружают.
import { getStorage } from '../src/lib/storage'

const TOOL = 'reset-test-database'
const VERSION = '1.0.0'
// Фраза подтверждения режима --clean (вводится вручную в терминале).
const CONFIRM_PHRASE = 'УДАЛИТЬ ТЕСТОВЫЕ ДАННЫЕ'

// ─── Инвентаризация: план удаления (порядок = зависимости FK) ──────────
// kind 'all' — DELETE всех строк; 'non-master' — DELETE кроме мастера
// (транзакция, Prisma-делегаты). Порядок: сессии → листья сделок →
// сделки → аккаунты → сотрудники/журналы. Проверено по схеме: все
// required-FK без onDelete (Restrict) удаляются РАНЬШЕ родителей
// (Order→Contract→Customer/LegalEntity, LeadBroker/OrderBroker→Broker,
// PermitCheckRequirement→PermitRequirement).

type DeleteStep =
  | { kind: 'all'; table: string; reason: string }
  | { kind: 'non-master'; table: 'Employee' | 'TotpRecoveryCode'; reason: string }

const DELETE_PLAN: DeleteStep[] = [
  // Фаза А: сессии и токены всех пользователей (мастер входит заново).
  { kind: 'all', table: 'EmployeeSession', reason: 'сессии сотрудников — отозваны в т.ч. у мастера (ТЗ §2.1)' },
  { kind: 'all', table: 'ClientSession', reason: 'сессии клиентского кабинета' },
  { kind: 'all', table: 'ContractorSession', reason: 'сессии кабинета подрядчика (кабинет заморожен, D31)' },
  { kind: 'all', table: 'BrokerSession', reason: 'сессии брокерского кабинета' },
  // Фаза Б: листья и связанные записи сделок (дети раньше родителей).
  { kind: 'all', table: 'PermitCheckItem', reason: 'охваченные позиции проверок ТН ВЭД (DF-26)' },
  { kind: 'all', table: 'PermitCheckRequirement', reason: 'требования, созданные проверками (Restrict → раньше PermitCheck/PermitRequirement)' },
  { kind: 'all', table: 'PermitCheck', reason: 'проверки разрешительных документов (DF-26; self-FK — одним DELETE)' },
  { kind: 'all', table: 'PermitRequirement', reason: 'обязательства предоставить документы (DF-16)' },
  { kind: 'all', table: 'CustomsFxRecalc', reason: 'информационные пересчёты курса (DF-27, append-only)' },
  { kind: 'all', table: 'CustomsCalculationItem', reason: 'строки расчётов таможенных платежей (DF-19)' },
  { kind: 'all', table: 'CustomsCalculation', reason: 'расчёты таможенных платежей — история версий (DF-19/DF-27)' },
  { kind: 'all', table: 'QuoteOptionCalcLine', reason: 'строки транспортного расчёта вариантов (DF-27)' },
  { kind: 'all', table: 'QuoteOptionRevision', reason: 'история изменений вариантов (DF-27)' },
  { kind: 'all', table: 'LeadApprovalSnapshot', reason: 'снимки согласования расчёта (поток A)' },
  { kind: 'all', table: 'LeadPrintRevisionConfirmation', reason: 'подтверждения печатных редакций (Р-3)' },
  { kind: 'all', table: 'LeadPrintRevision', reason: 'неизменяемые печатные редакции (Р-3)' },
  { kind: 'all', table: 'DocumentVersion', reason: 'версии документов: байты (fileData) и ключи хранилища (storageKey, DF-11)' },
  { kind: 'all', table: 'Document', reason: 'документы сделок (Дорожка Е)' },
  { kind: 'all', table: 'BrokerEstimateItem', reason: 'строки оценок брокера по ТН ВЭД (DF-18)' },
  { kind: 'all', table: 'BrokerEstimate', reason: 'оценки таможенных платежей брокера (5а)' },
  { kind: 'all', table: 'OrderBroker', reason: 'связи брокеров с заявками (Restrict → раньше Broker)' },
  { kind: 'all', table: 'LeadBroker', reason: 'связи брокеров с лидами + оценка (Restrict → раньше Broker)' },
  { kind: 'all', table: 'OrderStageInstance', reason: 'этапы заказов (SetNull подрядчика уже не актуален)' },
  { kind: 'all', table: 'Activity', reason: 'лента событий/история действий (Ж2), включая глобальные события тестового периода' },
  { kind: 'all', table: 'CustomsFinalPayment', reason: 'окончательные платежи по ДТ (Р-5)' },
  { kind: 'all', table: 'QuoteOption', reason: 'варианты расчёта лидов (В3)' },
  { kind: 'all', table: 'Order', reason: 'заявки (Restrict → раньше Contract)' },
  { kind: 'all', table: 'Lead', reason: 'лиды воронки (В1)' },
  { kind: 'all', table: 'Contract', reason: 'рамочные договоры (Restrict → раньше Customer/LegalEntity)' },
  // Фаза В: аккаунты внешних пользователей.
  { kind: 'all', table: 'CustomerUser', reason: 'пользователи компаний-клиентов (DF-02A)' },
  { kind: 'all', table: 'Customer', reason: 'компании-клиенты' },
  { kind: 'all', table: 'ContractorLead', reason: 'кандидаты в пул подрядчиков (Дорожка Г)' },
  { kind: 'all', table: 'Contractor', reason: 'подрядчики (пул; кабинет заморожен, D31)' },
  { kind: 'all', table: 'BrokerUser', reason: 'пользователи брокеров (DF-02A)' },
  { kind: 'all', table: 'Broker', reason: 'брокеры' },
  // Фаза Г: сотрудники, кроме ровно одного мастера; журналы.
  { kind: 'non-master', table: 'TotpRecoveryCode', reason: 'коды восстановления TOTP — только мастера сохраняются (ТЗ §2.1)' },
  { kind: 'non-master', table: 'Employee', reason: 'сотрудники, кроме мастера (ТЗ §3)' },
  { kind: 'all', table: 'LoginAttempt', reason: 'журнал попыток входа (З2) — тестовые данные' },
  { kind: 'all', table: 'Notification', reason: 'очередь и журнал уведомлений (DF-03)' },
  { kind: 'all', table: 'NotificationPreference', reason: 'пользовательские настройки доставки уведомлений' },
]

// ─── Инвентаризация: сохраняемые и спорные таблицы ─────────────────────

const KEEP: Record<string, string> = {
  OrderStageCatalog: 'справочник типовых этапов заявок (Б2, сид)',
  StageDocumentRequirement: 'системный чек-лист документов этапов (DF-14, сид)',
  Setting: 'глобальные настройки приложения (DF-00D) — ТЗ §2.3',
  RefItem: 'справочники: страны/валюты/упаковка/Инкотермс (DF-17)',
  CurrencyRate: 'официальные курсы ЦБ РФ (DF-17) — ТЗ §2.2',
  HsCode: 'справочник ТН ВЭД ЕАЭС (DF-17C) — ТЗ §2.2',
  HsImport: 'журнал импортов ТН ВЭД — системный, к пользовательским данным не относится',
  CustomsFeeScale: 'шкала таможенных сборов (DF-19, ПП РФ №1637)',
}

const DISPUTED: Record<string, string> = {
  LegalEntity:
    'спорная (ТЗ §4): собственные юрлица для договоров — справочный характер ' +
    '(CRUD /admin/legal-entities, сид создаёт образец). НЕ удаляется автоматически; ' +
    'решение об удалении — за владельцем проекта',
}

// Критичные колонки — сверка схемы перед очисткой (ТЗ §5Б «неожиданные
// изменения схемы»): отсутствие любой из них = отказ.
const REQUIRED_COLUMNS: Record<string, string[]> = {
  Employee: ['id', 'phone', 'password', 'roles', 'totpSecret', 'totpEnabledAt', 'totpLastStep'],
  TotpRecoveryCode: ['id', 'employeeId', 'codeHash', 'usedAt'],
  DocumentVersion: ['id', 'documentId', 'storageKey', 'fileData'],
  Setting: ['key', 'value'],
  RefItem: ['dir', 'code'],
}

const ALL_DELETE_TABLES = DELETE_PLAN.map((s) => s.table)
const EXPECTED_TABLES = new Set([...ALL_DELETE_TABLES, ...Object.keys(KEEP), ...Object.keys(DISPUTED)])

// ─── Типы состояния ─────────────────────────────────────────────────────

type DbId = { db: string; host: string; urlHash: string; masked: string }

type MasterSnapshot = {
  id: string
  password: string
  totpSecret: string | null
  totpEnabledAt: Date | null
  totpLastStep: number | null
  codes: Array<{ id: string; codeHash: string; usedAt: string | null }>
}

type Analysis = {
  tablesInDb: string[]
  unknownTables: string[]
  missingTables: string[]
  missingColumns: string[]
  counts: Record<string, number>
  masters: number
  master: MasterSnapshot | null
  files: { storageKeys: number; legacyRows: number }
}

type StepResult = { table: string; deleted: number }

type FilePhase = {
  driver: 's3' | 'local' | null
  planned: number
  deleted: number
  failed: number
  failures: string[]
  unavailableReason: string | null
}

type CheckResult = { n: number; name: string; ok: boolean; detail: string }

type Report = {
  tool: typeof TOOL
  version: typeof VERSION
  mode: 'dry-run' | 'clean' | 'retry-pending'
  startedAt: string
  finishedAt: string
  database: { db: string; host: string; urlHash: string; maskedUrl: string }
  masterId: string | null
  summary: Record<string, number>
  tables: Array<{ table: string; category: string; rowsBefore?: number; deleted?: number; rowsAfter?: number }>
  files: { plannedStorageKeys?: number; legacyByteaRows?: number; deleted?: number; failed?: number; pendingListFile?: string | null; driver?: string | null }
  checks?: CheckResult[]
  errors: string[]
  status: 'успешно' | 'частично успешно' | 'ошибка' | 'отменено (запуск не выполнялся)'
}

// ─── Мелкие помощники ───────────────────────────────────────────────────

function describeDb(url: string): DbId | null {
  try {
    const u = new URL(url)
    const db = u.pathname.replace(/^\//, '')
    if (!db) return null
    const host = u.hostname + (u.port ? `:${u.port}` : '')
    const urlHash = createHash('sha256').update(url).digest('hex').slice(0, 12)
    return { db, host, urlHash, masked: `postgresql://***:***@${host}/${db}` }
  } catch {
    return null
  }
}

function looksLikeProduction(dbId: DbId): boolean {
  // «prod» в имени базы или хосте — отказ в любом режиме (страховка
  // поверх allowlist: опечатка в RESET_DB_ALLOWED не открывает прод).
  return /prod/i.test(dbId.db) || /prod/i.test(dbId.host)
}

function parseRoles(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? v.map((x) => String(x)) : []
  } catch {
    return []
  }
}

function isMasterRow(roles: string): boolean {
  return parseRoles(roles).includes('master')
}

function ts(): string {
  return new Date().toISOString()
}

function stamp(d = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
}

const log = (...a: unknown[]): void => console.log(...a)
const warn = (...a: unknown[]): void => console.warn('  !!', ...a)
const err = (...a: unknown[]): void => console.error('  !!', ...a)

function hr(): void {
  log('─'.repeat(72))
}

// ─── Анализ базы (read-only) ────────────────────────────────────────────

async function listTables(prisma: PrismaClient | Prisma.TransactionClient): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1`,
  )
  return rows.map((r) => r.tablename)
}

async function countRows(prisma: PrismaClient | Prisma.TransactionClient, table: string): Promise<number> {
  // Имя таблицы — только из статического манифеста, интерполяции
  // пользовательского ввода нет.
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM "${table}"`)
  return rows[0]?.n ?? 0
}

async function listColumns(prisma: PrismaClient | Prisma.TransactionClient): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
  )
  return new Set(rows.map((r) => `${r.table_name}.${r.column_name}`))
}

async function analyze(prisma: PrismaClient): Promise<Analysis> {
  const tablesInDb = await listTables(prisma)
  const unknownTables = tablesInDb.filter((t) => !EXPECTED_TABLES.has(t))
  const known = new Set(tablesInDb)
  const missingTables = [...EXPECTED_TABLES].filter((t) => !known.has(t)).sort()

  const columns = await listColumns(prisma)
  const missingColumns: string[] = []
  for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
    for (const c of cols) if (!columns.has(`${table}.${c}`)) missingColumns.push(`${table}.${c}`)
  }

  const counts: Record<string, number> = {}
  for (const table of [...EXPECTED_TABLES]) {
    counts[table] = known.has(table) ? await countRows(prisma, table) : -1 // -1 = таблицы нет
  }

  const employees = await prisma.employee.findMany()
  const masterRows = employees.filter((e) => isMasterRow(e.roles))
  let master: MasterSnapshot | null = null
  if (masterRows.length === 1) {
    const m = masterRows[0]
    const codes = await prisma.totpRecoveryCode.findMany({
      where: { employeeId: m.id },
      select: { id: true, codeHash: true, usedAt: true },
      orderBy: { id: 'asc' },
    })
    master = {
      id: m.id,
      password: m.password,
      totpSecret: m.totpSecret,
      totpEnabledAt: m.totpEnabledAt,
      totpLastStep: m.totpLastStep,
      codes: codes.map((c) => ({ id: c.id, codeHash: c.codeHash, usedAt: c.usedAt ? c.usedAt.toISOString() : null })),
    }
  }

  const files = {
    storageKeys: known.has('DocumentVersion')
      ? (
          await prisma.$queryRawUnsafe<{ storageKey: string }[]>(
            `SELECT DISTINCT "storageKey" FROM "DocumentVersion" WHERE "storageKey" IS NOT NULL`,
          )
        ).length
      : 0,
    legacyRows: counts['DocumentVersion'] > 0
      ? (
          await prisma.$queryRawUnsafe<{ n: number }[]>(
            `SELECT COUNT(*)::int AS n FROM "DocumentVersion" WHERE "fileData" IS NOT NULL`,
          )
        )[0]?.n ?? 0
      : 0,
  }

  return { tablesInDb, unknownTables, missingTables, missingColumns, counts, masters: masterRows.length, master, files }
}

// ─── Печать анализа (без секретов) ──────────────────────────────────────

// Строк к удалению с учётом частичных таблиц: строка мастера и его коды
// восстановления остаются (ТЗ §2.1).
function deleteRowsOf(a: Analysis): number {
  const masterRow = a.masters === 1 ? 1 : 0
  const masterCodes = a.master?.codes.length ?? 0
  return ALL_DELETE_TABLES.reduce((s, t) => {
    const n = Math.max(0, a.counts[t])
    if (t === 'Employee') return s + Math.max(0, n - masterRow)
    if (t === 'TotpRecoveryCode') return s + Math.max(0, n - masterCodes)
    return s + n
  }, 0)
}

function printAnalysis(a: Analysis, dbId: DbId): void {
  hr()
  log(`База: ${dbId.masked}  |  хеш подключения: ${dbId.urlHash}`)
  log(`Мастер-аккаунтов (roles содержит "master"): ${a.masters}`)

  const kept = Object.keys(KEEP).filter((t) => a.counts[t] >= 0)
  const disputed = Object.keys(DISPUTED).filter((t) => a.counts[t] >= 0)
  const keptRows = kept.reduce((s, t) => s + a.counts[t], 0) + disputed.reduce((s, t) => s + a.counts[t], 0)
  const delRows = deleteRowsOf(a)

  log('')
  log('Итоговый отчёт (Dry Run):')
  log('  ┌ Категория ─────────────────────────────┬ Количество')
  log(`  │ Мастер-аккаунт                          │ ${a.masters === 1 ? 1 : 0}`)
  log(`  │ Сохраняемые системные записи            │ ${keptRows}`)
  log(`  │ Удаляемые пользовательские записи       │ ${delRows}`)
  log(`  │ Удаляемые файлы (ключи хранилища)       │ ${a.files.storageKeys}`)
  log(`  │ Легаси-версии с байтами в БД            │ ${a.files.legacyRows}`)
  log(`  │ Неклассифицированные таблицы            │ ${a.unknownTables.length}`)
  log('  └─────────────────────────────────────────┴───────────')

  const touched = ALL_DELETE_TABLES.filter((t) => a.counts[t] > 0)
  log('')
  log(`Таблицы к очистке (${touched.length} затронуто из ${ALL_DELETE_TABLES.length}):`)
  for (const t of touched) {
    if (t === 'Employee' && a.masters === 1) log(`  - ${t}: ${a.counts[t]} (к удалению ${a.counts[t] - 1} — мастер сохраняется)`)
    else if (t === 'TotpRecoveryCode') log(`  - ${t}: ${a.counts[t]} (к удалению ${Math.max(0, a.counts[t] - (a.master?.codes.length ?? 0))} — коды мастера сохраняются)`)
    else log(`  - ${t}: ${a.counts[t]}`)
  }
  if (touched.length === 0) log('  (пусто — удалять нечего)')

  log('')
  log(`Сохраняемые таблицы (${Object.keys(KEEP).length}):`)
  for (const [t, why] of Object.entries(KEEP)) log(`  = ${t}: ${a.counts[t] >= 0 ? a.counts[t] : 'нет в БД'} — ${why}`)
  log(`Спорные таблицы (${Object.keys(DISPUTED).length}):`)
  for (const [t, why] of Object.entries(DISPUTED)) log(`  ? ${t}: ${a.counts[t] >= 0 ? a.counts[t] : 'нет в БД'} — ${why}`)

  if (a.unknownTables.length > 0) {
    warn(`НЕИЗВЕСТНЫЕ таблицы (нет в инвентаризации) — очистка заблокирована:`)
    for (const t of a.unknownTables) warn(`  + ${t}`)
  }
  if (a.missingTables.length > 0) {
    warn(`Таблицы инвентаризации, которых НЕТ в базе: ${a.missingTables.join(', ')}`)
  }
  if (a.missingColumns.length > 0) {
    warn(`Отсутствуют критичные колонки: ${a.missingColumns.join(', ')}`)
  }
}

// ─── Подтверждение (TTY + фраза) ────────────────────────────────────────

async function confirmClean(dbId: DbId, delRows: number, files: number): Promise<boolean> {
  if (process.env.CI === 'true' || process.env.CI === '1') {
    err('Отказ: обнаружен CI-окружение (CI=true) — очистка из CI запрещена (ТЗ §5Б).')
    return false
  }
  if (process.stdin.isTTY !== true) {
    err('Отказ: подтверждение требует интерактивного терминала (TTY). Запуск без TTY (CI/скрипты) невозможен.')
    return false
  }
  log('')
  log(`Цель: ${dbId.masked} (хеш ${dbId.urlHash})`)
  log(`Будет удалено строк: ${delRows}; файлов хранилища: ${files}.`)
  log('Отмена: Ctrl+C. Для продолжения введите фразу подтверждения:')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question('> ')) ?? ''
  rl.close()
  if (answer.trim() !== CONFIRM_PHRASE) {
    err('Фраза не совпала — очистка НЕ выполнялась.')
    return false
  }
  return true
}

// ─── Гард окружения (ТЗ §6) ─────────────────────────────────────────────

function guardEnv(mode: 'dry-run' | 'clean' | 'retry-pending', dbId: DbId): string | null {
  if (!dbId) return 'DATABASE_URL не задан или некорректен.'
  if (looksLikeProduction(dbId)) {
    return `Имя базы/хост содержит «prod» (${dbId.db}) — очистка запрещена в любом режиме.`
  }
  if (mode === 'dry-run') return null
  const allowed = (process.env.RESET_DB_ALLOWED ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (allowed.length === 0) {
    return 'Переменная RESET_DB_ALLOWED не задана: очистка требует явного перечня разрешённых имён тестовых баз (через запятую). Dry Run доступен без неё.'
  }
  if (allowed.some((n) => /prod/i.test(n))) {
    return 'В RESET_DB_ALLOWED указано имя с «prod» — исправьте перечень.'
  }
  if (!allowed.includes(dbId.db)) {
    return `База «${dbId.db}» не входит в RESET_DB_ALLOWED (${allowed.join(', ')}).`
  }
  return null
}

// ─── Фаза файлов (после коммита; ТЗ §7) ─────────────────────────────────

async function deleteStorageFiles(keys: string[]): Promise<FilePhase> {
  const phase: FilePhase = { driver: null, planned: keys.length, deleted: 0, failed: 0, failures: [], unavailableReason: null }
  if (keys.length === 0) return phase
  let driver: ReturnType<typeof getStorage>
  try {
    driver = getStorage()
    phase.driver = driver.kind
  } catch (e) {
    phase.unavailableReason = e instanceof Error ? e.message : String(e)
    phase.failed = keys.length
    phase.failures = [...keys]
    return phase
  }
  // Локальный драйвер без явного каталога = риск «очистки не той папки»
  // (по умолчанию .storage относительно CWD). ТЗ §7: частичную очистку
  // скрывать нельзя — поэтому при неявной конфигурации файлы уходят в
  // pending-список, а не в молчаливый успех.
  if (driver.kind === 'local' && !process.env.STORAGE_LOCAL_DIR?.trim()) {
    phase.unavailableReason =
      'STORAGE_LOCAL_DIR не задан: локальный драйвер использовал бы каталог по умолчанию (.storage от CWD). Задайте STORAGE_LOCAL_DIR явно (или настройте S3_*) и повторите — ключи записаны в pending-список.'
    phase.failed = keys.length
    phase.failures = [...keys]
    return phase
  }
  for (const key of keys) {
    let ok = false
    let lastErr: unknown = null
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      try {
        await driver.deleteObject(key)
        // Верификация удаления (ТЗ §7: частичную очистку скрывать нельзя):
        // rm по чужому пути мог бы «успешно» ничего не удалить — проверяем,
        // что объекта больше нет в том хранилище, которое сконфигурировано.
        const still = await driver.head(key)
        if (still !== null) throw new Error('объект остался в хранилище после DELETE — проверьте STORAGE_LOCAL_DIR / S3_* ')
        ok = true
      } catch (e) {
        lastErr = e
        await new Promise((r) => setTimeout(r, 300))
      }
    }
    if (ok) phase.deleted++
    else {
      phase.failed++
      phase.failures.push(key)
      warn(`файл не удалён (остался в хранилище): ${key} — ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)
    }
  }
  return phase
}

async function loadKeysFromPendingFile(path: string): Promise<string[]> {
  const text = readFileSync(path, 'utf-8')
  return text.split('\n').map((s) => s.trim()).filter(Boolean)
}

// ─── Пост-проверки (ТЗ §8) ──────────────────────────────────────────────

function sameMaster(a: MasterSnapshot, b: MasterSnapshot): boolean {
  return (
    a.id === b.id &&
    a.password === b.password &&
    a.totpSecret === b.totpSecret &&
    (a.totpEnabledAt?.getTime() ?? null) === (b.totpEnabledAt?.getTime() ?? null) &&
    a.totpLastStep === b.totpLastStep
  )
}

function sameCodes(a: MasterSnapshot['codes'], b: MasterSnapshot['codes']): boolean {
  const norm = (list: MasterSnapshot['codes']) =>
    list.map((c) => `${c.id}:${c.codeHash}:${c.usedAt ?? '-'}`).sort().join('|')
  return norm(a) === norm(b)
}

async function runPostChecks(
  prisma: PrismaClient,
  before: Analysis,
  filesPhase: FilePhase,
  masterId: string,
): Promise<{ checks: CheckResult[]; after: Analysis }> {
  const after = await analyze(prisma)
  const c = after.counts
  const checks: CheckResult[] = []
  const push = (n: number, name: string, ok: boolean, detail: string) => checks.push({ n, name, ok, detail })

  push(1, 'Мастер-аккаунт существует и единственный', after.masters === 1, `masters=${after.masters}`)
  push(2, 'Идентификатор мастера прежний', after.master?.id === masterId, `id=${after.master?.id ?? '—'}`)
  const masterSame = after.master && before.master ? sameMaster(before.master, after.master) : false
  const codesSame = after.master && before.master ? sameCodes(before.master.codes, after.master.codes) : false
  push(
    3,
    'Пароль, TOTP и коды восстановления мастера не изменены',
    masterSame && codesSame,
    `password/totp=${masterSame ? 'без изменений' : 'ИЗМЕНЕНЫ'}; codes=${codesSame ? `${after.master?.codes.length ?? 0} шт., набор прежний` : 'НАБОР ИЗМЕНИЛСЯ'}`,
  )
  const refTables = ['RefItem', 'OrderStageCatalog', 'StageDocumentRequirement', 'HsCode', 'HsImport', 'CustomsFeeScale', 'CurrencyRate']
  const refOk = refTables.every((t) => c[t] === before.counts[t])
  push(4, 'Системные справочники сохранены', refOk, refTables.map((t) => `${t}=${c[t]}`).join(', '))
  const settingKeysAfter = await prisma.setting.findMany({ select: { key: true }, orderBy: { key: 'asc' } })
  push(
    5,
    'Глобальные настройки сохранены',
    c['Setting'] === before.counts['Setting'] && settingKeysAfter.length === before.counts['Setting'],
    `Setting=${c['Setting']}`,
  )
  const accountsOk =
    c['Employee'] === 1 && c['Customer'] === 0 && c['CustomerUser'] === 0 && c['Broker'] === 0 &&
    c['BrokerUser'] === 0 && c['Contractor'] === 0 && c['ContractorLead'] === 0
  push(6, 'Других пользовательских аккаунтов не осталось', accountsOk, `Employee=1, Customer/CustomerUser/Broker/BrokerUser/Contractor/ContractorLead=0`)
  const dealsOk = c['Lead'] === 0 && c['QuoteOption'] === 0 && c['Order'] === 0 && c['Contract'] === 0 && c['OrderStageInstance'] === 0
  push(7, 'Лиды, варианты и заказы удалены', dealsOk, 'Lead/QuoteOption/Order/Contract/OrderStageInstance=0')
  const docsOk =
    c['Document'] === 0 && c['DocumentVersion'] === 0 && c['PermitRequirement'] === 0 && c['PermitCheck'] === 0 &&
    c['CustomsCalculation'] === 0 && c['LeadPrintRevision'] === 0 && c['Activity'] === 0
  push(8, 'Документы и связанные записи удалены', docsOk, 'Document/DocumentVersion/Permit*/CustomsCalculation/PrintRevision/Activity=0')
  push(9, 'Очереди и настройки уведомлений очищены', c['Notification'] === 0 && c['NotificationPreference'] === 0, `Notification=${c['Notification']}, Preference=${c['NotificationPreference']}`)
  const sessionsOk =
    c['EmployeeSession'] === 0 && c['ClientSession'] === 0 && c['ContractorSession'] === 0 && c['BrokerSession'] === 0 && c['LoginAttempt'] === 0
  push(10, 'Сессии всех пользователей отозваны', sessionsOk, 'все 4 таблицы сессий + LoginAttempt = 0')
  // Частичные таблицы: законные остатки — строка мастера и его коды.
  const expectedPartial: Record<string, number> = { Employee: 1, TotpRecoveryCode: after.master?.codes.length ?? 0 }
  const orphanRows = ALL_DELETE_TABLES.reduce((s, t) => s + Math.max(0, c[t] - (expectedPartial[t] ?? 0)), 0)
  const masterCodesIntact = after.master ? after.master.codes.length === (before.master?.codes.length ?? 0) : false
  push(11, 'Записей-сирот нет', orphanRows === 0 && c['Employee'] === 1 && masterCodesIntact, `чужих строк в удаляемых таблицах: ${orphanRows} (Employee=1 мастер, кодов мастера=${after.master?.codes.length ?? 0})`)
  push(12, 'Неклассифицированных таблиц не появилось', after.unknownTables.length === 0, `unknown=${after.unknownTables.length}`)
  const matchOk =
    refTables.every((t) => c[t] === before.counts[t]) &&
    c['Setting'] === before.counts['Setting'] &&
    c['LegalEntity'] === before.counts['LegalEntity'] &&
    c['TotpRecoveryCode'] === (before.master?.codes.length ?? 0) &&
    orphanRows === 0
  push(13, 'Результат соответствует предварительному отчёту', matchOk, 'сохранённые = до очистки; удаляемые = 0')
  // Файлы — отдельной строкой к проверкам БД.
  push(14, 'Файлы хранилища обработаны по двухфазной схеме', filesPhase.failed === 0, `план=${filesPhase.planned}, удалено=${filesPhase.deleted}, ошибок=${filesPhase.failed}${filesPhase.unavailableReason ? ' (хранилище недоступно)' : ''}`)
  return { checks, after }
}

// ─── Отчёт ──────────────────────────────────────────────────────────────

function reportPath(mode: string, explicit?: string): string {
  return explicit ?? `reset-db-report-${mode}-${stamp()}.json`
}

function writeReport(path: string, report: Report): void {
  writeFileSync(path, JSON.stringify(report, null, 2), 'utf-8')
  log(`Отчёт: ${path}`)
}

function printChecks(checks: CheckResult[]): boolean {
  log('')
  log('Контрольные проверки после очистки:')
  let all = true
  for (const ch of checks) {
    if (!ch.ok) all = false
    log(`  ${ch.ok ? '[OK]' : '[!!]'} ${ch.n}. ${ch.name} — ${ch.detail}`)
  }
  return all
}

// ─── Режим A: Dry Run ───────────────────────────────────────────────────

async function dryRun(prisma: PrismaClient, dbId: DbId, reportFile?: string): Promise<number> {
  const startedAt = ts()
  log('Режим A — предварительный отчёт (Dry Run). Изменений не будет.')
  const a = await analyze(prisma)
  printAnalysis(a, dbId)

  const delRows = deleteRowsOf(a)
  const keptRows =
    Object.keys(KEEP).concat(Object.keys(DISPUTED)).filter((t) => a.counts[t] >= 0).reduce((s, t) => s + a.counts[t], 0)

  const blocked = a.unknownTables.length > 0 || a.missingTables.length > 0 || a.missingColumns.length > 0
  const status: Report['status'] = blocked || a.masters !== 1 ? 'ошибка' : 'успешно'
  const errors: string[] = []
  if (a.masters !== 1) errors.push(`найдено мастеров: ${a.masters} (нужно ровно 1)`)
  if (a.unknownTables.length > 0) errors.push(`неизвестные таблицы: ${a.unknownTables.join(', ')}`)
  if (a.missingTables.length > 0) errors.push(`отсутствуют таблицы инвентаризации: ${a.missingTables.join(', ')}`)
  if (a.missingColumns.length > 0) errors.push(`отсутствуют критичные колонки: ${a.missingColumns.join(', ')}`)

  log('')
  if (status === 'ошибка') {
    err('Dry Run выявил блокирующие расхождения — очистка (режим B) будет отказана:')
    for (const e of errors) err(`  - ${e}`)
  } else {
    log('Блокирующих расхождений нет; режим B (--clean) разрешён при соблюдении предохранителей.')
  }

  const report: Report = {
    tool: TOOL,
    version: VERSION,
    mode: 'dry-run',
    startedAt,
    finishedAt: ts(),
    database: { db: dbId.db, host: dbId.host, urlHash: dbId.urlHash, maskedUrl: dbId.masked },
    masterId: a.master?.id ?? null,
    summary: { masters: a.masters, keptRows, deleteRows: delRows, files: a.files.storageKeys, legacyByteaRows: a.files.legacyRows, unknownTables: a.unknownTables.length },
    tables: [...EXPECTED_TABLES].sort().map((t) => ({
      table: t,
      category: KEEP[t] ? 'keep' : DISPUTED[t] ? 'disputed' : 'delete',
      rowsBefore: a.counts[t],
    })),
    files: { plannedStorageKeys: a.files.storageKeys, legacyByteaRows: a.files.legacyRows },
    errors,
    status,
  }
  writeReport(reportFile ?? reportPath('dry-run'), report)
  return status === 'ошибка' ? 1 : 0
}

// ─── Режим B: фактическая очистка ───────────────────────────────────────

async function clean(
  prisma: PrismaClient,
  dbId: DbId,
  opts: { reportFile?: string; baselineFile?: string },
): Promise<number> {
  const startedAt = ts()
  log('Режим B — фактическая очистка тестовой базы.')

  // 1. Предварительный анализ.
  const a1 = await analyze(prisma)
  printAnalysis(a1, dbId)

  // 2. Гард мастеров и схемы — до подтверждения.
  if (a1.masters !== 1) {
    err(`ОТКАЗ: найдено мастеров — ${a1.masters}, требуется ровно 1 (ТЗ §2.1). Данные не удалялись.`)
    return 1
  }
  if (a1.unknownTables.length > 0 || a1.missingTables.length > 0 || a1.missingColumns.length > 0) {
    err('ОТКАЗ: схема не соответствует утверждённой инвентаризации (см. выше). Данные не удалялись.')
    return 1
  }

  // 3. Опциональная сверка с отчётом Dry Run (тот же хеш подключения,
  //    те же счётчики — иначе данные уплыли, запускаемся заново с Dry Run).
  if (opts.baselineFile) {
    type Baseline = {
      database?: { db?: string; urlHash?: string }
      masterId?: string
      // Dry Run пишет tables массивом {table, rowsBefore}; допускаем и словарь.
      tables?: Array<{ table: string; rowsBefore?: number }> | Record<string, number>
      files?: { plannedStorageKeys?: number }
    }
    let base: Baseline
    try {
      base = JSON.parse(readFileSync(opts.baselineFile, 'utf-8')) as Baseline
    } catch (e) {
      err(`ОТКАЗ: baseline не читается (${opts.baselineFile}): ${e instanceof Error ? e.message : String(e)}`)
      return 1
    }
    const baseTables: Record<string, number> = Array.isArray(base.tables)
      ? Object.fromEntries(base.tables.map((r) => [r.table, r.rowsBefore ?? 0]))
      : (base.tables ?? {})
    const diffs: string[] = []
    if (base.database?.urlHash && base.database.urlHash !== dbId.urlHash) diffs.push('другая база (urlHash не совпал)')
    if (base.database?.db && base.database.db !== dbId.db) diffs.push(`другое имя базы: ${base.database.db} → ${dbId.db}`)
    if (base.masterId && base.masterId !== a1.master?.id) diffs.push('мастер-аккаунт другой')
    for (const [t, n] of Object.entries(baseTables)) {
      if (a1.counts[t] !== n) diffs.push(`${t}: было ${n}, стало ${a1.counts[t]}`)
    }
    if (diffs.length > 0) {
      err('ОТКАЗ: база изменилась с момента Dry Run:')
      for (const d of diffs) err(`  - ${d}`)
      err('Перезапустите Dry Run и сверьте изменения.')
      return 1
    }
    log(`Сверка с Dry Run (${opts.baselineFile}): расхождений нет.`)
  }

  // 4. Явное подтверждение.
  const delRows = deleteRowsOf(a1)
  const ok = await confirmClean(dbId, delRows, a1.files.storageKeys)
  if (!ok) return 1

  // 5. Повторный анализ после подтверждения (данные не изменились?).
  const a2 = await analyze(prisma)
  const drifted = ALL_DELETE_TABLES.some((t) => a2.counts[t] !== a1.counts[t]) || a2.masters !== 1
  if (drifted) {
    err('ОТКАЗ: база изменилась между подтверждением и началом удаления. Данные не удалялись; запустите очистку заново.')
    return 1
  }
  const master = a2.master!

  // 5а. Ключи хранилища собираются ДО удаления строк (после DELETE таблица
  //     пуста — список нельзя получить позднее; ТЗ §7 двухфазная схема).
  const fileKeys = (
    await prisma.$queryRawUnsafe<{ storageKey: string }[]>(
      `SELECT DISTINCT "storageKey" FROM "DocumentVersion" WHERE "storageKey" IS NOT NULL`,
    )
  ).map((r) => r.storageKey)

  // 6. Транзакционное удаление (ТЗ §6): ошибка = полный откат.
  log('')
  log('Удаление (одна транзакция, откат при ошибке)...')
  const deleted: StepResult[] = []
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const step of DELETE_PLAN) {
          let n = 0
          if (step.kind === 'all') {
            n = await tx.$executeRawUnsafe(`DELETE FROM "${step.table}"`)
          } else if (step.table === 'TotpRecoveryCode') {
            n = (await tx.totpRecoveryCode.deleteMany({ where: { employeeId: { not: master.id } } })).count
          } else {
            n = (await tx.employee.deleteMany({ where: { id: { not: master.id } } })).count
          }
          if (n > 0) deleted.push({ table: step.table, deleted: n })
        }
      },
      { maxWait: 20_000, timeout: 300_000 },
    )
  } catch (e) {
    err('ОТКАТ: транзакция прервана, база не изменена. Причина:')
    err(`  ${e instanceof Error ? e.message : String(e)}`)
    const report: Report = {
      tool: TOOL, version: VERSION, mode: 'clean', startedAt, finishedAt: ts(),
      database: { db: dbId.db, host: dbId.host, urlHash: dbId.urlHash, maskedUrl: dbId.masked },
      masterId: master.id, summary: {}, tables: [], files: {},
      errors: [`транзакция отклонена: ${e instanceof Error ? e.message : String(e)}`],
      status: 'ошибка',
    }
    writeReport(opts.reportFile ?? reportPath('clean-error'), report)
    return 1
  }
  log(`Удалено строк: ${deleted.reduce((s, d) => s + d.deleted, 0)} (таблиц затронуто: ${deleted.length})`)

  // 7. Фаза файлов — ТОЛЬКО после успешного коммита (ТЗ §7).
  const filesPhase = await deleteStorageFiles(fileKeys)
  log(`Файлы хранилища: план ${filesPhase.planned}, удалено ${filesPhase.deleted}, ошибок ${filesPhase.failed}${filesPhase.driver ? ` (драйвер: ${filesPhase.driver})` : ''}`)
  let pendingListFile: string | null = null
  if (filesPhase.failures.length > 0) {
    pendingListFile = `${(opts.reportFile ?? reportPath('clean')).replace(/\.json$/, '')}.pending-files.txt`
    writeFileSync(pendingListFile, filesPhase.failures.join('\n') + '\n', 'utf-8')
    warn(`Список не удалённых ключей: ${pendingListFile} (довыработка: --retry-pending)`)
  }

  // 8. Пост-проверки (ТЗ §8).
  const { checks, after } = await runPostChecks(prisma, a2, filesPhase, master.id)
  printChecks(checks)

  // 9. Итоговый отчёт (ТЗ §9) — без секретов и ПДн. БД-проверки (1-13)
  //    определяют успех/ошибку; файловые ошибки (п.14) — «частично успешно».
  const dbChecksOk = checks.filter((ch) => ch.n <= 13).every((ch) => ch.ok)
  const status: Report['status'] = dbChecksOk ? (filesPhase.failed > 0 ? 'частично успешно' : 'успешно') : 'ошибка'
  const rf = opts.reportFile ?? reportPath('clean')
  const report: Report = {
    tool: TOOL, version: VERSION, mode: 'clean', startedAt, finishedAt: ts(),
    database: { db: dbId.db, host: dbId.host, urlHash: dbId.urlHash, maskedUrl: dbId.masked },
    masterId: master.id,
    summary: {
      rowsBefore: deleteRowsOf(a2),
      rowsDeleted: deleted.reduce((s, d) => s + d.deleted, 0),
      rowsKept: Object.keys(KEEP).concat(Object.keys(DISPUTED)).reduce((s, t) => s + Math.max(0, after.counts[t]), 0),
      filesDeleted: filesPhase.deleted,
      filesFailed: filesPhase.failed,
    },
    tables: [...EXPECTED_TABLES].sort().map((t) => {
      const del = deleted.find((d) => d.table === t)?.deleted
      return { table: t, category: KEEP[t] ? 'keep' : DISPUTED[t] ? 'disputed' : 'delete', rowsBefore: a2.counts[t], deleted: del ?? 0, rowsAfter: after.counts[t] }
    }),
    files: {
      plannedStorageKeys: filesPhase.planned,
      deleted: filesPhase.deleted,
      failed: filesPhase.failed,
      pendingListFile,
      driver: filesPhase.driver,
      legacyByteaRows: a2.files.legacyRows,
    },
    checks,
    errors: checks.filter((ch) => !ch.ok).map((ch) => `${ch.n}. ${ch.name}: ${ch.detail}`),
    status,
  }
  writeReport(rf, report)

  log('')
  log(`Итог: ${status}.`)
  return status === 'успешно' ? 0 : status === 'частично успешно' ? 3 : 1
}

// ─── Режим C: довыработка файлов (повторная обработка ошибок, ТЗ §7) ───

async function retryPending(dbId: DbId, pendingFile: string, reportFile?: string): Promise<number> {
  const startedAt = ts()
  log('Режим C — довыработка неудалённых файлов хранилища.')
  let keys: string[]
  try {
    keys = await loadKeysFromPendingFile(pendingFile)
  } catch (e) {
    err(`Файл со списком не читается: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
  if (keys.length === 0) {
    log('Список пуст — нечего довырабатывать.')
    return 0
  }
  const ok = await confirmClean(dbId, 0, keys.length)
  if (!ok) return 1
  const phase = await deleteStorageFiles(keys)
  log(`Файлы: план ${phase.planned}, удалено ${phase.deleted}, ошибок ${phase.failed}`)
  const report: Report = {
    tool: TOOL, version: VERSION, mode: 'retry-pending', startedAt, finishedAt: ts(),
    database: { db: dbId.db, host: dbId.host, urlHash: dbId.urlHash, maskedUrl: dbId.masked },
    masterId: null, summary: { filesDeleted: phase.deleted, filesFailed: phase.failed },
    tables: [], files: { plannedStorageKeys: phase.planned, deleted: phase.deleted, failed: phase.failed, driver: phase.driver },
    errors: phase.failures.length > 0 ? [`${phase.failures.length} ключей не удалено — см. pending-файл`] : [],
    status: phase.failed === 0 ? 'успешно' : phase.deleted > 0 ? 'частично успешно' : 'ошибка',
  }
  writeReport(reportFile ?? reportPath('retry-pending'), report)
  if (phase.failed > 0) {
    const next = (reportFile ?? reportPath('retry-pending')).replace(/\.json$/, '') + '.pending-files.txt'
    writeFileSync(next, phase.failures.join('\n') + '\n', 'utf-8')
    warn(`Оставшиеся ключи: ${next}`)
  }
  return phase.failed === 0 ? 0 : 3
}

// ─── CLI ────────────────────────────────────────────────────────────────

function usage(code: number): number {
  log([
    'Использование:',
    '  npx tsx scripts/reset-test-database.ts --dry-run [--report <файл.json>]',
    '  npx tsx scripts/reset-test-database.ts --clean [--baseline <dry-run.json>] [--report <файл.json>]',
    '  npx tsx scripts/reset-test-database.ts --retry-pending <файл.txt> [--report <файл.json>]',
    '',
    'Предохранители: RESET_DB_ALLOWED (имена тестовых баз через запятую) обязателен для',
    '--clean; имя/хост с «prod» запрещён; подтверждение фразой в интерактивном терминале;',
    'в CI запуск невозможен. Секреты и строки подключения в логи не выводятся.',
    'Без флагов ничего не выполняется.',
  ].join('\n'))
  return code
}

type Args = {
  mode: 'dry-run' | 'clean' | 'retry-pending' | 'help' | null
  reportFile?: string
  baselineFile?: string
  pendingFile?: string
  problem?: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') {
      if (args.mode) return { mode: 'help', problem: 'указано несколько режимов' }
      args.mode = 'dry-run'
    } else if (a === '--clean') {
      if (args.mode) return { mode: 'help', problem: 'указано несколько режимов' }
      args.mode = 'clean'
    } else if (a === '--retry-pending') {
      if (args.mode) return { mode: 'help', problem: 'указано несколько режимов' }
      args.mode = 'retry-pending'
      const v = argv[++i]
      if (!v) return { mode: 'help', problem: '--retry-pending требует путь к файлу' }
      args.pendingFile = v
    } else if (a === '--report') {
      const v = argv[++i]
      if (!v) return { mode: 'help', problem: '--report требует путь' }
      args.reportFile = v
    } else if (a === '--baseline') {
      const v = argv[++i]
      if (!v) return { mode: 'help', problem: '--baseline требует путь' }
      args.baselineFile = v
    } else if (a === '--help' || a === '-h') {
      return { mode: 'help' }
    } else {
      return { mode: 'help', problem: `неизвестный аргумент: ${a}` }
    }
  }
  return args
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  if (args.mode === 'help' || args.mode === null) {
    if (args.problem) err(`Ошибка аргументов: ${args.problem}`)
    return usage(args.problem ? 2 : 0)
  }

  const dbId = describeDb(process.env.DATABASE_URL ?? '')
  if (!dbId) {
    err('DATABASE_URL не задан или некорректен (Prisma-скрипт без базы не работает).')
    return 1
  }
  const guardProblem = guardEnv(args.mode, dbId)
  if (guardProblem) {
    err(`ОТКАЗ (гард окружения): ${guardProblem}`)
    return 1
  }

  const prisma = new PrismaClient()
  try {
    // Проверка подключения (ТЗ §5Б «повторно проверить подключение»).
    await prisma.$queryRawUnsafe('SELECT 1')
    if (args.mode === 'dry-run') return await dryRun(prisma, dbId, args.reportFile)
    if (args.mode === 'clean') return await clean(prisma, dbId, { reportFile: args.reportFile, baselineFile: args.baselineFile })
    return await retryPending(dbId, args.pendingFile!, args.reportFile)
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    err('Непредвиденная ошибка:', e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
