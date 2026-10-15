import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from './db'

// ─────────────────────────────────────────────────────────────
//  Защита входа от перебора (З2, LOGISTICS-REWORK-QUEUE.md).
//  Паттерн перенесён из APEX Moto (src/lib/rate-limit.ts):
//  скользящее окно по записям в БД (LoginAttempt) — не зависит
//  от состояния процесса, работает на serverless/multi-instance.
//
//  Лимиты (считают только ПРОВАЛЬНЫЕ попытки — см. отличие 1):
//    5 провалов в минуту на IP
//    20 провалов в час на IP
//    10 провалов за 5 минут на связку «логин ИЛИ IP» — закрывает
//    оба сценария перебора: spray по списку телефонов с одного
//    адреса и распределённый перебор одного логина с разных.
//
//  Отличия от APEX — осознанные:
//    1) в лимиты идут только провалы. Logix — небольшой B2B-офис:
//       несколько менеджеров сидят за одним IP, и в APEX (где
//       считались все попытки, включая успешные) утренний вход
//       всей команды запирал бы офис. Успехи пишутся в таблицу
//       для аудита, но никого не блокируют.
//    2) без in-memory кэша: вход — не hot path, три count-запроса
//       по индексам дешевле, чем рассинхрон пер-инстансовых кэшей
//       (APEX держал кэш с TTL 10с ради скорости).
//    3) заблокированные (429) попытки в таблицу не пишутся —
//       блокировка живёт ровно до конца окна от последнего
//       записанного провала и не продлевает сама себя.
//
//  Точки вызова: проверка — ДО обращения к таблице пользователей
//  и сверки пароля (формулировка З2); запись провала — на каждом
//  401 (нет такого телефона ИЛИ неверный пароль — одна
//  формулировка, различие не раскрываем и в аудите); запись
//  успеха — после verifyPassword. 403 «деактивирован/нет ролей»
//  не записывается: это состояние аккаунта, а не сигнал перебора,
//  пароль при этом не сверялся.
//
//  DISABLE_RATE_LIMIT=true отключает и проверку, и запись —
//  аварийный люк для CI (З3), не для продакшена.
// ─────────────────────────────────────────────────────────────

export type LoginKind = 'employee' | 'contractor' | 'client' | 'broker'

const WINDOW_MIN = 60 * 1000
const WINDOW_5MIN = 5 * 60 * 1000
const WINDOW_HOUR = 60 * 60 * 1000

const MAX_FAILS_PER_MIN = 5
const MAX_FAILS_PER_HOUR = 20
const MAX_FAILS_PER_LOGIN_5MIN = 10

// Записи старше суток не нужны никому: самое длинное окно — час,
// аудит — «последние сутки». Чистка opportunity-стиком: при записи
// новой попытки с вероятностью 5% (не заводить отдельный крон ради
// одной таблицы; при любом живом трафике входов таблица не растёт).
const RETENTION_MS = 24 * 60 * 60 * 1000
const CLEANUP_CHANCE = 0.05

// Прод то же считает на Vercel: x-forwarded-for там ставит
// платформа, спуфить клиент его не может. Локальная разработка
// без прокси попадает в 'unknown' — все локальные клиенты один IP.
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

function tooMany(error: string, retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
  )
}

async function countFails(where: Prisma.LoginAttemptWhereInput): Promise<number> {
  return db.loginAttempt.count({ where: { ...where, success: false } })
}

/**
 * Проверка лимитов перебора. Вызывать ДО поиска пользователя и
 * сверки пароля. null — вход разрешён, роут продолжает свою логику;
 * NextResponse — готовый 429 с Retry-After, вернуть его как есть.
 *
 * Вид входа (сотрудник/подрядчик/клиент/брокер) проверке не нужен —
 * лимиты общие на все четыре портала (И1 добавила третью дверь, Д —
 * четвёртую): перебор подрядчика запирает и вход сотрудников с того
 * же IP (и наоборот), переключение «дверей» не даёт дополнительных
 * попыток.
 */
export async function checkLoginGuard(
  req: NextRequest,
  login: string
): Promise<NextResponse | null> {
  if (process.env.DISABLE_RATE_LIMIT === 'true') return null

  const ip = getClientIp(req)

  // 1) Минутное окно по IP — основной тормоз горячего перебора
  const minuteFails = await countFails({
    ip,
    createdAt: { gte: new Date(Date.now() - WINDOW_MIN) },
  })
  if (minuteFails >= MAX_FAILS_PER_MIN) {
    return tooMany('Слишком много попыток входа. Подождите минуту.', 60)
  }

  // 2) Часовое окно по IP — страховка от «терпеливого» перебора:
  // 5 попыток в минуту не дают набрать заметную выборку за час
  const hourFails = await countFails({
    ip,
    createdAt: { gte: new Date(Date.now() - WINDOW_HOUR) },
  })
  if (hourFails >= MAX_FAILS_PER_HOUR) {
    return tooMany('Превышен лимит попыток входа за час. Подождите.', 3600)
  }

  // 3) Пятиминутное окно «логин ИЛИ IP» — анти-перечисление:
  // порог ниже, чем дал бы один только IP-счётчик на этом окне
  const sprayFails = await countFails({
    OR: [{ login }, { ip }],
    createdAt: { gte: new Date(Date.now() - WINDOW_5MIN) },
  })
  if (sprayFails >= MAX_FAILS_PER_LOGIN_5MIN) {
    return tooMany('Слишком много попыток входа. Подождите 5 минут.', 300)
  }

  return null
}

/**
 * Запись одной попытки входа (провал 401 или успех) — для лимитов
 * и аудита. Ошибка записи не должна ломать сам вход: аудит
 * вторичен (паттерн APEX), поэтому всё в try/catch.
 */
export async function recordLoginAttempt(
  req: NextRequest,
  opts: { kind: LoginKind; login: string; success: boolean }
): Promise<void> {
  if (process.env.DISABLE_RATE_LIMIT === 'true') return
  try {
    await db.loginAttempt.create({
      data: {
        kind: opts.kind,
        ip: getClientIp(req),
        login: opts.login,
        userAgent: req.headers.get('user-agent') || null,
        success: opts.success,
      },
    })
    if (Math.random() < CLEANUP_CHANCE) {
      await db.loginAttempt.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
      })
    }
  } catch (e) {
    console.error('[login-guard] failed to record attempt:', e)
  }
}
