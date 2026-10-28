import { Prisma, type CustomerUser, type BrokerUser, type Customer, type Broker } from '@prisma/client'
import type { NextRequest, NextResponse } from 'next/server'
import { hashPassword, verifyPassword } from './password'
import { normalizePhone, isEmail } from './phone'
import { db } from './db'
import { checkLoginGuard, recordLoginAttempt } from './login-guard'
import { CLIENT_PASSWORD_MIN } from './client-constants'

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
// Отличия уникальности телефона (решение схемы, см. schema.prisma):
//  • CustomerUser — уникальность ВНУТРИ компании (по образцу
//    Customer.phone: @unique на живой базе с возможными дублями
//    справочника не вводим, вход ищет findFirst по самому старому);
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

  return tx.customerUser.create({
    data: {
      customerId,
      name,
      phone,
      email,
      password: password ?? null,
      isPrimary: data.isPrimary ?? false,
    },
  })
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

  return tx.customerUser.update({
    where: { id },
    data: {
      name,
      phone,
      email,
      ...(password !== undefined ? { password } : {}),
    },
  })
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

  // findFirst по самому старому — детерминированность старого входа
  // (phone у CustomerUser без @unique, решение схемы); только
  // пользователи с выданным паролем: «дубль без пароля» не перехватывает вход.
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
