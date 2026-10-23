import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from './db'

// ─────────────────────────────────────────────────────────────
//  Защита входа от перебора. Скользящие окна по таблице
//  LoginAttempt (работает на serverless/multi-instance), считаются
//  только ПРОВАЛЫ: менеджеры за одним офисным IP не запирают друг друга.
//
//  Жёсткие лимиты (429):
//    5 провалов в минуту на IP, 20 в час на IP;
//    10 провалов за 5 минут на пару «логин + IP».
//  Лимит только по логину (с любых IP) — НЕ блокирует, а замедляет
//  ответ (прогрессивная задержка до 5 с). Иначе злоумышленник
//  десятком запросов с любого адреса запирает вход владельцу (E0-05).
//
//  IP берётся только из доверенного источника (getClientIp):
//  подмена X-Forwarded-For клиентом не даёт новых попыток.
//
//  DISABLE_RATE_LIMIT=true отключает проверку и запись — только для CI.
// ─────────────────────────────────────────────────────────────

export type LoginKind = 'employee' | 'contractor' | 'client' | 'broker'

const WINDOW_MIN = 60 * 1000
const WINDOW_5MIN = 5 * 60 * 1000
const WINDOW_HOUR = 60 * 60 * 1000

const MAX_FAILS_PER_MIN = 5
const MAX_FAILS_PER_HOUR = 20
const MAX_FAILS_PER_LOGIN_IP_5MIN = 10
// После скольких провалов по логину (с любых IP за 15 минут)
// начинается замедление и какой у него потолок
const WINDOW_15MIN = 15 * 60 * 1000
const LOGIN_SLOWDOWN_AFTER = 5
const LOGIN_SLOWDOWN_MAX_MS = 5000

// Записи старше суток не нужны никому: самое длинное окно — час,
// аудит — «последние сутки». Чистка opportunity-стиком: при записи
// новой попытки с вероятностью 5% (не заводить отдельный крон ради
// одной таблицы; при любом живом трафике входов таблица не растёт).
const RETENTION_MS = 24 * 60 * 60 * 1000
const CLEANUP_CHANCE = 0.05

// Доверенный IP клиента.
//  - Vercel: платформа сама выставляет x-vercel-forwarded-for /
//    x-real-ip / x-forwarded-for и перезаписывает значение клиента.
//  - Свой хостинг за nginx/Cloudflare: TRUSTED_PROXY=true — прокси
//    обязан перезаписывать X-Forwarded-For (берём первый адрес).
//  - Иначе заголовкам не верим: все клиенты попадают в общий
//    бакет 'unknown' — строже, но подмена заголовка ничего не даёт.
export function getClientIp(req: NextRequest): string {
  const h = req.headers
  if (process.env.VERCEL === '1') {
    return (
      h.get('x-vercel-forwarded-for')?.split(',')[0].trim() ||
      h.get('x-real-ip') ||
      h.get('x-forwarded-for')?.split(',')[0].trim() ||
      'unknown'
    )
  }
  if (process.env.TRUSTED_PROXY === 'true') {
    return h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'unknown'
  }
  return 'unknown'
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
 * Лимиты общие для всех четырёх кабинетов: смена «двери» не даёт
 * дополнительных попыток.
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

  // 3) Пара «логин + IP» — перебор одного аккаунта с одного адреса
  const pairFails = await countFails({
    login,
    ip,
    createdAt: { gte: new Date(Date.now() - WINDOW_5MIN) },
  })
  if (pairFails >= MAX_FAILS_PER_LOGIN_IP_5MIN) {
    return tooMany('Слишком много попыток входа. Подождите 5 минут.', 300)
  }

  // 4) Только логин (распределённый перебор) — замедляем, не блокируем:
  // владелец со своего IP войдёт, но перебор становится дорогим
  const loginFails = await countFails({
    login,
    createdAt: { gte: new Date(Date.now() - WINDOW_15MIN) },
  })
  if (loginFails >= LOGIN_SLOWDOWN_AFTER) {
    const delay = Math.min(
      LOGIN_SLOWDOWN_MAX_MS,
      500 * 2 ** (loginFails - LOGIN_SLOWDOWN_AFTER)
    )
    await new Promise((r) => setTimeout(r, delay))
  }

  return null
}

/**
 * Запись одной попытки входа (провал 401 или успех) — для лимитов
 * и аудита. Ошибка записи не ломает сам вход (try/catch).
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
