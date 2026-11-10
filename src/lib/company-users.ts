import { Prisma, type CustomerUser, type BrokerUser, type Customer, type Broker } from '@prisma/client'
import { createHash, randomInt } from 'node:crypto'
import type { NextRequest, NextResponse } from 'next/server'
import { hashPassword, verifyPassword } from './password'
import { normalizePhone, isEmail } from './phone'
import { db } from './db'
import { checkLoginGuard, recordLoginAttempt } from './login-guard'
import { CLIENT_PASSWORD_MIN } from './client-constants'
import { emitEvent } from './events'
import type { EmployeeActor } from './activity'

// ─── DF-02A: пользователи компании — единая точка (D34, P1-07) ────────
// У клиента и у брокера одна семантика «человек внутри компании»:
// создание, правка, деактивация, перенос основного пользователя.
// Одна функция на действие обслуживает обе ветки (Г1: общая точка
// вместо двух копий; различия — только делегат Prisma и правила
// уникальности телефона).
//
// Правила, общие с прежней выдачей доступа (И1):
//  • пароль всегда хешируется здесь (hashPassword, scrypt) — сырой
//    пароль в БД не попадает;
//  • пароль без нормализованного телефона (+7…) не выдаётся — вход
//    идёт по телефону, «мертворождённый» доступ не создаётся;
//  • смена пароля и деактивация рвут сессии (паттерн Ж6в/И1), но
//    только сессии ЭТОГО пользователя — коллег не задеваем.
//
// Отличия уникальности телефона (решение схемы, см. schema.prisma;
// поток A волна 2, AUD-03 — решение владельца А2, план ред. 3 §5.1):
//  • CustomerUser — уникальность ГЛОБАЛЬНАЯ: findFirst-проверки дают
//    человекочитаемый 409, физический уникальный индекс
//    CustomerUser_phone_key (миграция bl_phone_ops) + backstop P2002
//    закрывают гонку «findFirst → create» (аудит: 8 параллельных
//    выдач → 3 строки); вход по телефону детерминирован;
//  • BrokerUser — уникальность ГЛОБАЛЬНАЯ (наследование @unique
//    Broker.phone, вход детерминирован findUnique).
//
// Все функции принимают tx: Prisma.TransactionClient — вызываются и
// с db, и внутри $transaction (паттерн emitEvent).

// Бизнес-ошибка управления пользователями: роуты отдают её клиенту
// как готовый ответ (status/message), остальное — общий обработчик
// (паттерн SettingValidationError из DF-00D).
export class CompanyUserError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// ── Backstop AUD-03: гонка «findFirst → create/update» ─────────────
// findFirst-проверки дают человекочитаемый 409, но под нагрузкой двое
// успевают пройти проверку до записи обоих. Физический уникальный
// индекс CustomerUser_phone_key (миграция bl_phone_ops) отзывается
// ошибкой P2002 — переводим её в тот же понятный 409.
function isPhoneUniqueViolation(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false
  const target = e.meta?.target ?? e.meta?.constraint ?? ''
  return JSON.stringify(target).includes('phone')
}

// ── BL-8: одноразовый код смены телефона (план ред. 3 §5.2) ────────
// TTL 15 минут, лимит попыток ввода 5 (далее — запрос нового кода),
// хеш — ДЕТЕРМИНИРОВАННЫЙ sha256 (как коды восстановления DF-09):
// атомарный одноразовый захват — updateMany WHERE phoneCodeHash = H,
// поэтому хеш обязан совпадать при каждом вычислении одного и того же
// кода; солевой scrypt (hashPassword) на это неспособен. Соль не
// нужна: пространство кода — 10^6, лимит 5 попыток + TTL 15 мин.
export const PHONE_CODE_TTL_MINUTES = 15
export const PHONE_CODE_MAX_ATTEMPTS = 5

function hashPhoneCode(code: string): string {
  return createHash('sha256').update(`logix-phone-code:${code}`).digest('hex')
}

function generatePhoneCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

// Режим доставки кода на новый номер. WhatsApp/SMS-шлюза нет (P2-01:
// интерфейс NotificationTransport зарезервирован, email-канал не умеет
// в телефон) — код выводится администрирующему менеджеру в ответе API
// (диалог показывает его с инструкцией «сообщите клиенту по телефону/
// мессенджеру»), событие помечается delivery: 'manual_by_manager' —
// честная фиксация, что проверку кода провёл менеджер. Режим —
// свойство ОТСУТСТВИЯ шлюза: при его появлении функция переключается
// без изменения кода операций (план ред. 3 §5.2 п. 2).
export function phoneCodeDelivery(): 'manual_by_manager' {
  return 'manual_by_manager'
}

export type PhoneChangeStartResult = {
  delivery: 'manual_by_manager'
  // Ручной режим: код виден менеджеру в ответе (в транспорт не уходит).
  // При появлении шлюза поле исчезнет из ответа — контракт потребителя
  // (диалог) обязан читать код только при delivery='manual_by_manager'.
  code?: string
  expiresAt: Date
}

export type PhoneChangeConfirmResult =
  | { ok: true; phone: string }
  | { ok: false; status: 400; message: string }

export type CreateCompanyUserData = {
  name: string
  phone?: string | null
  email?: string | null
  // Сырой пароль — хешируется здесь. null — контакт без входа (P1-07).
  password?: string | null
  isPrimary?: boolean
}

export type UpdateCompanyUserData = {
  name?: string
  phone?: string | null
  email?: string | null
  password?: string | null
}

// ── Валидация входных данных (общая для клиента и брокера) ──────────

function requireName(name: string | undefined, current?: string): string {
  const trimmed = (name ?? current ?? '').trim()
  if (!trimmed) {
    throw new CompanyUserError(400, 'Укажите имя пользователя')
  }
  return trimmed
}

// Телефон храним нормализованным (+7XXXXXXXXXX). Возврат:
// undefined — «не передавалось» (update оставляет как есть);
// null — явная очистка; string — нормализованный номер. Мусорная
// строка — ошибка, а не молчаливый null: менеджер должен увидеть
// опечатку сразу.
function resolvePhone(raw: string | null | undefined): string | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null || raw === '') return null
  const phone = normalizePhone(raw)
  if (!phone) {
    throw new CompanyUserError(400, 'Телефон должен быть российским номером (+7…) — вход идёт по телефону')
  }
  return phone
}

// Email свободной формы не сохраняем: пустое — null, мусор — ошибка
// (адрес адресат уведомлений DF-02/DF-03, garbage туда допустить нельзя).
function resolveEmail(raw: string | null | undefined): string | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null || raw === '') return null
  const trimmed = raw.trim()
  if (!isEmail(trimmed)) {
    throw new CompanyUserError(400, 'Некорректный email')
  }
  return trimmed
}

// Пароль хешируется здесь; пустая строка — ошибка (как у сотрудников
// Ж6в). Сырое значение дальше lib не уходит. Минимум — общий с
// кабинетами (CLIENT_PASSWORD_MIN = 8, как BROKER_PASSWORD_MIN):
// единая точка в lib надёжнее, чем надежда, что каждый роут помнит
// про zod-минимум (Блок 5: управление людьми из двух UI).
function resolvePassword(raw: string | null | undefined): string | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null || raw === '') return null
  if (raw.trim().length < CLIENT_PASSWORD_MIN) {
    // Захватывает и «пустой после trim»: пароль из пробелов не выдаём.
    throw new CompanyUserError(400, `Пароль — минимум ${CLIENT_PASSWORD_MIN} символов`)
  }
  return hashPassword(raw)
}

// Инвариант «пароль есть → телефон нормализованный есть» (правило
// выдачи доступа И1): вход идёт по телефону, пользователь с паролем
// и без телефона не должен появиться ни при создании, ни при правке.
function assertPhoneForPassword(
  password: string | null | undefined,
  phone: string | null | undefined
): void {
  if (password && !phone) {
    throw new CompanyUserError(
      400,
      'Вход в кабинет идёт по телефону — укажите нормализованный российский телефон (+7…), чтобы выдать пароль'
    )
  }
}

// ── Клиентская компания: пользователи кабинета клиента ───────────────

export async function createCustomerUser(
  tx: Prisma.TransactionClient,
  customerId: string,
  data: CreateCompanyUserData
): Promise<CustomerUser> {
  const name = requireName(data.name)
  const phone = resolvePhone(data.phone ?? null) ?? null
  const email = resolveEmail(data.email ?? null) ?? null
  const password = resolvePassword(data.password)
  assertPhoneForPassword(password, phone)

  if (phone) {
    // Уникальность внутри компании (решение схемы: БЕЗ @unique —
    // защита на уровне приложения, 409; см. шапку файла) И у других
    // компаний: пользователь другой компании с тем же телефоном
    // никогда бы не вошёл (вход ищет findFirst по самому старому) —
    // не создаём мёртвый вход.
    const dupe = await tx.customerUser.findFirst({ where: { customerId, phone } })
    if (dupe) {
      throw new CompanyUserError(409, 'Пользователь с таким телефоном уже есть в этой компании')
    }
    const cross = await tx.customerUser.findFirst({ where: { phone, customerId: { not: customerId } } })
    if (cross) {
      throw new CompanyUserError(409, 'Этот телефон уже занят пользователем другой компании')
    }
  }

  if (data.isPrimary) {
    const primary = await tx.customerUser.findFirst({ where: { customerId, isPrimary: true } })
    if (primary) {
      throw new CompanyUserError(409, 'Основной пользователь у этой компании уже есть')
    }
  }

  try {
    return await tx.customerUser.create({
      data: {
        customerId,
        name,
        phone,
        email,
        password: password ?? null,
        isPrimary: data.isPrimary ?? false,
      },
    })
  } catch (e) {
    // Backstop AUD-03: гонку findFirst→create закрыл уникальный индекс
    if (isPhoneUniqueViolation(e)) {
      throw new CompanyUserError(409, 'Этот телефон уже занят другим пользователем')
    }
    throw e
  }
}

export async function updateCustomerUser(
  tx: Prisma.TransactionClient,
  id: string,
  data: UpdateCompanyUserData
): Promise<CustomerUser> {
  const user = await tx.customerUser.findUnique({ where: { id } })
  if (!user) {
    throw new CompanyUserError(404, 'Пользователь не найден')
  }

  const name = data.name === undefined ? user.name : requireName(data.name)
  // «Не передано» (undefined) = оставить текущее; null = очистить.
  const phoneResolved = resolvePhone(data.phone)
  const phone = phoneResolved === undefined ? user.phone : phoneResolved
  const emailResolved = resolveEmail(data.email)
  const email = emailResolved === undefined ? user.email : emailResolved
  const password = resolvePassword(data.password)
  // Инвариант по ИТОГОВОМУ состоянию: пароль (новый или уже выданный)
  // без телефона недопустим — иначе правка телефона «на пусто»
  // оставляла бы вход без логина.
  assertPhoneForPassword(password ?? user.password ?? null, phone)

  if (phone && phone !== user.phone) {
    const dupe = await tx.customerUser.findFirst({
      where: { customerId: user.customerId, phone, id: { not: id } },
    })
    if (dupe) {
      throw new CompanyUserError(409, 'Пользователь с таким телефоном уже есть в этой компании')
    }
    const cross = await tx.customerUser.findFirst({
      where: { phone, customerId: { not: user.customerId } },
    })
    if (cross) {
      throw new CompanyUserError(409, 'Этот телефон уже занят пользователем другой компании')
    }
  }

  // Смена пароля рвёт сессии ЭТОГО пользователя (паттерн Ж6в/И1,
  // суженный до человека): «старый вход больше не доверен». Сессии
  // коллег не трогаются.
  if (password !== undefined) {
    await tx.clientSession.deleteMany({ where: { userId: id } })
  }

  try {
    return await tx.customerUser.update({
      where: { id },
      data: {
        name,
        phone,
        email,
        ...(password !== undefined ? { password } : {}),
      },
    })
  } catch (e) {
    // Backstop AUD-03: гонку findFirst→update закрыл уникальный индекс
    if (isPhoneUniqueViolation(e)) {
      throw new CompanyUserError(409, 'Этот телефон уже занят другим пользователем')
    }
    throw e
  }
}

// Деактивация закрывает сессии пользователя немедленно (по образцу
// компании И1); повторная активация возвращает контакт к работе.
// Основной пользователь деактивации не подлежит: он — перенос старого
// входа компании, доступ компании целиком закрывается деактивацией
// компании (Customer.isActive), а не отдельного человека.
export async function setCustomerUserActive(
  tx: Prisma.TransactionClient,
  id: string,
  isActive: boolean
): Promise<CustomerUser> {
  const user = await tx.customerUser.findUnique({ where: { id } })
  if (!user) {
    throw new CompanyUserError(404, 'Пользователь не найден')
  }
  if (!isActive && user.isPrimary) {
    throw new CompanyUserError(
      409,
      'Основной пользователь деактивации не подлежит. Чтобы закрыть доступ компании целиком, деактивируйте компанию в справочнике'
    )
  }
  if (!isActive) {
    await tx.clientSession.deleteMany({ where: { userId: id } })
  }
  return tx.customerUser.update({ where: { id }, data: { isActive } })
}

// Основной пользователь — точка входа Блока 3 (перенос входа компании
// на человека) и писем DF-02/DF-03 (recipientsOfCustomer).
export async function getPrimaryCustomerUser(
  tx: Prisma.TransactionClient,
  customerId: string
): Promise<CustomerUser | null> {
  return tx.customerUser.findFirst({ where: { customerId, isPrimary: true } })
}

// ── BL-8: смена телефона с проверкой нового номера (ред. 3 §5.2) ────
// Двухшаговая операция: шаг 1 выдаёт код на НОВЫЙ номер, шаг 2 —
// атомарное одноразовое подтверждение (паттерн AUD-04: updateMany
// WHERE hash+TTL+лимита, count===1). Подтверждённый телефон остаётся
// в phone — вход работает до и после смены без перерыва; повторный
// шаг 1 перезаписывает код (поля одни на пользователя). Сессии НЕ
// гасятся: смена логина ≠ компрометация устройства (паттерн гашения —
// за сменой пароля и перепривязкой). Событие customer_user_phone_changed
// пишется в транзакции ПОДТВЕРЖДЕНИЯ (кто/старый→новый/режим доставки).
export async function startPhoneChange(
  tx: Prisma.TransactionClient,
  customerId: string,
  userId: string,
  newPhoneRaw: string
): Promise<PhoneChangeStartResult> {
  const user = await tx.customerUser.findFirst({ where: { id: userId, customerId } })
  if (!user) {
    throw new CompanyUserError(404, 'Пользователь не найден')
  }

  const newPhone = normalizePhone(newPhoneRaw)
  if (!newPhone) {
    throw new CompanyUserError(400, 'Телефон должен быть российским номером (+7…) — вход идёт по телефону')
  }
  if (newPhone === user.phone) {
    throw new CompanyUserError(400, 'Новый номер совпадает с текущим — менять нечего')
  }

  // Глобальная занятость (AUD-03): находка ДО записи — человекочитаемый
  // 409; уникальный индекс CustomerUser_phone_key + backstop P2002 —
  // защита гонки «шаг 1 ↔ выдача доступа с тем же номером» (К-12).
  const dupeSame = await tx.customerUser.findFirst({
    where: { customerId, phone: newPhone, id: { not: userId } },
  })
  if (dupeSame) {
    throw new CompanyUserError(409, 'Пользователь с таким телефоном уже есть в этой компании')
  }
  const dupeCross = await tx.customerUser.findFirst({
    where: { phone: newPhone, customerId: { not: customerId } },
  })
  if (dupeCross) {
    throw new CompanyUserError(409, 'Этот телефон уже занят пользователем другой компании')
  }

  const code = generatePhoneCode()
  const expiresAt = new Date(Date.now() + PHONE_CODE_TTL_MINUTES * 60_000)
  await tx.customerUser.update({
    where: { id: userId },
    data: {
      pendingPhone: newPhone,
      phoneCodeHash: hashPhoneCode(code),
      phoneCodeExpiresAt: expiresAt,
      phoneCodeAttempts: 0,
    },
  })
  const delivery = phoneCodeDelivery()
  return { delivery, ...(delivery === 'manual_by_manager' ? { code } : {}), expiresAt }
}

// Шаг 2 — подтверждение кодом. Захват атомарный: WHERE связывает
// версию строки хешом кода (параллельный шаг 1 перезаписывает хеш →
// count 0), одноразовость гарантирует запись phoneCodeHash: null
// (повтор того же кода count 0). Кривой/истёкший код — инкремент
// попыток ОТДЕЛЬНЫМ вызовом (план §5.2 п. 3), лимит 5 → новый код.
export async function confirmPhoneChange(
  tx: Prisma.TransactionClient,
  customerId: string,
  userId: string,
  code: string,
  actor: EmployeeActor
): Promise<PhoneChangeConfirmResult> {
  const user = await tx.customerUser.findFirst({ where: { id: userId, customerId } })
  if (!user) {
    throw new CompanyUserError(404, 'Пользователь не найден')
  }
  if (!user.pendingPhone || !user.phoneCodeHash) {
    return { ok: false, status: 400, message: 'Заявки на смену телефона нет — начните операцию заново' }
  }
  if (user.phoneCodeAttempts >= PHONE_CODE_MAX_ATTEMPTS) {
    return { ok: false, status: 400, message: 'Лимит попыток исчерпан — запросите новый код' }
  }
  if (!/^\d{6}$/.test(code.trim())) {
    await bumpPhoneCodeAttempts(tx, userId)
    return { ok: false, status: 400, message: 'Код неверен или истёк' }
  }

  // pendingPhone читается ДО захвата, но запись телефона связана
  // проверкой ХЕША в WHERE: если параллельный шаг 1 перезаписал
  // заявку (новый код), наш захват не сработает — устаревший номер
  // невозможно применить.
  const targetPhone = user.pendingPhone
  const claimed = await tx.customerUser.updateMany({
    where: {
      id: userId,
      phoneCodeHash: hashPhoneCode(code.trim()),
      phoneCodeExpiresAt: { gt: new Date() },
      phoneCodeAttempts: { lt: PHONE_CODE_MAX_ATTEMPTS },
    },
    data: {
      phone: targetPhone,
      pendingPhone: null,
      phoneCodeHash: null,
      phoneCodeExpiresAt: null,
      phoneCodeAttempts: 0,
    },
  })
  if (claimed.count !== 1) {
    await bumpPhoneCodeAttempts(tx, userId)
    const fresh = await tx.customerUser.findUnique({
      where: { id: userId },
      select: { phoneCodeAttempts: true },
    })
    if ((fresh?.phoneCodeAttempts ?? 0) >= PHONE_CODE_MAX_ATTEMPTS) {
      return { ok: false, status: 400, message: 'Лимит попыток исчерпан — запросите новый код' }
    }
    return { ok: false, status: 400, message: 'Код неверен или истёк' }
  }

  // P2002-гонка «подтверждение ↔ выдача доступа с тем же номером»
  // (К-12): updateMany при нарушении уникального индекса падает —
  // переводим в понятный 409 (pending-заявка остаётся на месте).
  // Обёртка транзакции (роут) отдаст ошибку клиенту как есть.
  await emitEvent(tx, {
    type: 'customer_user_phone_changed',
    actor,
    // Машиночитаемая метка режима доставки (manual_by_manager — ручной
    // режим: проверку кода провёл менеджер) + человеческая расшифровка
    description: `Телефон изменён: ${user.phone ?? '—'} → ${targetPhone} · доставка кода: manual_by_manager (вручную, менеджером)`,
  })
  return { ok: true, phone: targetPhone }
}

// Инкремент попыток ввода кода — отдельный updateMany с потолком:
// лимит защищён условием (а не чтением), гонка попыток не перепрыгнет.
async function bumpPhoneCodeAttempts(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.customerUser.updateMany({
    where: { id: userId, phoneCodeAttempts: { lt: PHONE_CODE_MAX_ATTEMPTS } },
    data: { phoneCodeAttempts: { increment: 1 } },
  })
}

// ── BL-9: перепривязка пользователя к другой компании (ред. 3 §5.3) ─
// Отдельная операция (телефон и компания — принципиально разные
// операции, А5). Предусловия: не-primary; целевая компания существует
// и активна; целевая ≠ текущая. Транзакция: блокировка строки
// (SELECT … FOR UPDATE, паттерн AUD-01) → перечитать и перепроверить
// → смена customerId → гашение ВСЕХ сессий («старый вход больше не
// доверен», живые вкладки старой компании умирают немедленно) →
// событие customer_user_rebound. Доступ к данным прежней компании
// НЕ передаётся по построению: кабинетские роуты скоупятся от
// customerId (client-auth.ts). История прежней компании сохраняется:
// события несут actorName-снимок, уведомления — toAddress-снимок,
// лиды/заявки/документы остаются в старой компании. Телефон (логин)
// не меняется — глобальный индекс AUD-03 не препятствует; заявка на
// смену телефона (pending-поля) сохраняется за человеком и
// подтверждается в карточке НОВОЙ компании.
export async function rebindCustomerUser(
  tx: Prisma.TransactionClient,
  customerId: string,
  userId: string,
  targetCustomerId: string,
  actor: EmployeeActor
): Promise<CustomerUser> {
  const user = await tx.customerUser.findFirst({ where: { id: userId, customerId } })
  if (!user) {
    throw new CompanyUserError(404, 'Пользователь не найден')
  }
  if (user.isPrimary) {
    throw new CompanyUserError(409, 'Назначьте другого основного пользователя: основной не перепривязывается')
  }
  if (targetCustomerId === customerId) {
    throw new CompanyUserError(409, 'Пользователь уже принадлежит этой компании')
  }
  const target = await tx.customer.findUnique({
    where: { id: targetCustomerId },
    select: { id: true, name: true, isActive: true },
  })
  if (!target) {
    throw new CompanyUserError(404, 'Целевая компания не найдена')
  }
  if (!target.isActive) {
    throw new CompanyUserError(409, 'Целевая компания деактивирована — доступ закрывается на уровне компании')
  }
  const from = await tx.customer.findUnique({
    where: { id: customerId },
    select: { name: true },
  })

  // К-13: блокировка строки пользователя разводит параллельные
  // операции (смена телефона / правка / выдача доступа / вторая
  // перепривязка); предусловия перепроверяются ПОД блокировкой.
  await tx.$queryRaw`SELECT id FROM "CustomerUser" WHERE id = ${userId} FOR UPDATE`
  const fresh = await tx.customerUser.findUnique({ where: { id: userId } })
  if (!fresh) {
    throw new CompanyUserError(404, 'Пользователь не найден')
  }
  if (fresh.customerId !== customerId) {
    throw new CompanyUserError(409, 'Пользователь только что был перепривязан параллельной операцией — обновите карточку')
  }
  if (fresh.isPrimary) {
    throw new CompanyUserError(409, 'Назначьте другого основного пользователя: основной не перепривязывается')
  }

  const updated = await tx.customerUser.update({
    where: { id: userId },
    data: { customerId: targetCustomerId },
  })
  await tx.clientSession.deleteMany({ where: { userId } })
  await emitEvent(tx, {
    type: 'customer_user_rebound',
    actor,
    description: `Перепривязка доступа: «${from?.name ?? '—'}» → «${target.name}» · сессии погашены, история прежней компании сохранена`,
  })
  return updated
}

// ── Брокерская компания: пользователи ЛК брокера ─────────────────────

export async function createBrokerUser(
  tx: Prisma.TransactionClient,
  brokerId: string,
  data: CreateCompanyUserData
): Promise<BrokerUser> {
  const name = requireName(data.name)
  const phone = resolvePhone(data.phone ?? null) ?? null
  const email = resolveEmail(data.email ?? null) ?? null
  const password = resolvePassword(data.password)
  assertPhoneForPassword(password, phone)

  if (phone) {
    // Глобальная уникальность — наследование @unique Broker.phone
    // (вход брокера детерминирован findUnique). Проверка ДО записи
    // даёт понятный 409 вместо сырого P2002.
    const dupe = await tx.brokerUser.findFirst({ where: { phone } })
    if (dupe) {
      throw new CompanyUserError(409, 'Этот телефон уже занят пользователем другого брокера')
    }
  }

  if (data.isPrimary) {
    const primary = await tx.brokerUser.findFirst({ where: { brokerId, isPrimary: true } })
    if (primary) {
      throw new CompanyUserError(409, 'Основной пользователь у этого брокера уже есть')
    }
  }

  return tx.brokerUser.create({
    data: {
      brokerId,
      name,
      phone,
      email,
      password: password ?? null,
      isPrimary: data.isPrimary ?? false,
    },
  })
}

export async function updateBrokerUser(
  tx: Prisma.TransactionClient,
  id: string,
  data: UpdateCompanyUserData
): Promise<BrokerUser> {
  const user = await tx.brokerUser.findUnique({ where: { id } })
  if (!user) {
    throw new CompanyUserError(404, 'Пользователь не найден')
  }

  const name = data.name === undefined ? user.name : requireName(data.name)
  // «Не передано» (undefined) = оставить текущее; null = очистить.
  const phoneResolved = resolvePhone(data.phone)
  const phone = phoneResolved === undefined ? user.phone : phoneResolved
  const emailResolved = resolveEmail(data.email)
  const email = emailResolved === undefined ? user.email : emailResolved
  const password = resolvePassword(data.password)
  assertPhoneForPassword(password ?? user.password ?? null, phone)

  if (phone && phone !== user.phone) {
    const dupe = await tx.brokerUser.findFirst({ where: { phone, id: { not: id } } })
    if (dupe) {
      throw new CompanyUserError(409, 'Этот телефон уже занят пользователем другого брокера')
    }
  }

  if (password !== undefined) {
    await tx.brokerSession.deleteMany({ where: { userId: id } })
  }

  return tx.brokerUser.update({
    where: { id },
    data: {
      name,
      phone,
      email,
      ...(password !== undefined ? { password } : {}),
    },
  })
}

export async function setBrokerUserActive(
  tx: Prisma.TransactionClient,
  id: string,
  isActive: boolean
): Promise<BrokerUser> {
  const user = await tx.brokerUser.findUnique({ where: { id } })
  if (!user) {
    throw new CompanyUserError(404, 'Пользователь не найден')
  }
  if (!isActive && user.isPrimary) {
    throw new CompanyUserError(
      409,
      'Основной пользователь деактивации не подлежит. Чтобы закрыть доступ брокера целиком, деактивируйте брокера в справочнике'
    )
  }
  if (!isActive) {
    await tx.brokerSession.deleteMany({ where: { userId: id } })
  }
  return tx.brokerUser.update({ where: { id }, data: { isActive } })
}

export async function getPrimaryBrokerUser(
  tx: Prisma.TransactionClient,
  brokerId: string
): Promise<BrokerUser | null> {
  return tx.brokerUser.findFirst({ where: { brokerId, isPrimary: true } })
}

// ── Вход (Блок 3, DF-02A): учётка — человек, UX прежний ──────────────
// Порядок и секреты старого входа сохранены дословно:
//  • guard перебора (З2) — ДО обращения к учёткам; 400 выше в аудит
//    не пишется (роут проверяет непустоту до вызова);
//  • одна формулировка на «нет такого»/«не тот пароль» — не раскрываем
//    перечень логинов; провал — в аудит перебора;
//  • 403 «доступ закрыт» — только тому, кто пароль уже сверил (статус
//    деактивации не раскрывается перебору); 403 в аудит не пишется:
//    пароль ВЕРНЫЙ, это состояние аккаунта.
export type CustomerLoginUser = CustomerUser & { customer: Customer }
export type BrokerLoginUser = BrokerUser & { broker: Broker }

export type CompanyLoginResult<U> =
  | { kind: 'rate-limited'; response: NextResponse }
  | { kind: 'invalid' }
  | { kind: 'closed'; message: string }
  | { kind: 'ok'; user: U }

export async function authenticateCustomerLogin(
  req: NextRequest,
  phone: string,
  password: string
): Promise<CompanyLoginResult<CustomerLoginUser>> {
  const guard = await checkLoginGuard(req, phone)
  if (guard) return { kind: 'rate-limited', response: guard }

  // findFirst по самому старому — детерминированность входа; с волны 2
  // (AUD-03, миграция bl_phone_ops) телефон пользователя ГЛОБАЛЬНО
  // уникален (CustomerUser_phone_key), дублей не существует — findFirst
  // фактически находка единственного входа; проверка пароля/флагов
  // остаётся belt-and-suspenders. Только пользователи с выданным
  // паролем: «контакт без входа» не перехватывает логин.
  const user = await db.customerUser.findFirst({
    where: { phone, password: { not: null } },
    include: { customer: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!user || !user.password || !verifyPassword(password, user.password)) {
    await recordLoginAttempt(req, { kind: 'client', login: phone, success: false })
    return { kind: 'invalid' }
  }
  // Деактивирован человек ИЛИ компания = доступ закрыт.
  if (!user.isActive || !user.customer.isActive) {
    return { kind: 'closed', message: 'Доступ в кабинет закрыт. Обратитесь к менеджеру.' }
  }
  await recordLoginAttempt(req, { kind: 'client', login: phone, success: true })
  return { kind: 'ok', user }
}

export async function authenticateBrokerLogin(
  req: NextRequest,
  phone: string,
  password: string
): Promise<CompanyLoginResult<BrokerLoginUser>> {
  const guard = await checkLoginGuard(req, phone)
  if (guard) return { kind: 'rate-limited', response: guard }

  // findUnique — наследование @unique Broker.phone (вход детерминирован).
  const user = await db.brokerUser.findUnique({ where: { phone }, include: { broker: true } })
  if (!user || !user.password || !verifyPassword(password, user.password)) {
    await recordLoginAttempt(req, { kind: 'broker', login: phone, success: false })
    return { kind: 'invalid' }
  }
  if (!user.isActive || !user.broker.isActive) {
    return { kind: 'closed', message: 'Доступ в портал закрыт. Обратитесь к менеджеру.' }
  }
  await recordLoginAttempt(req, { kind: 'broker', login: phone, success: true })
  return { kind: 'ok', user }
}
