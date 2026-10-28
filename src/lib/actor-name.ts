import { db } from '@/lib/db'

// ─── DF-02A (Блок 4): проекция имени актёра/автора по роли читателя ──
// Актор события и автор версии документа — ЧЕЛОВЕК: actorId/authorId
// хранят id пользователя компании (CustomerUser/BrokerUser), а строка
// actorName/authorName в БД — снимок КОМПАНИИ (наименее привилегиро-
// ванное значение: история не должна раскрывать людей другой стороне,
// даже если какой-то будущий читатель забудет проекцию).
//
// Отображаемое имя собирается ПРИ ЧТЕНИИ (решение Блока 1, не строка-
// снимок в БД) по правилу карточки DF-02A:
//   - сотрудникам нашей компании: «Имя (Компания)»;
//   - другой стороне (клиент видит действия брокера и наоборот):
//     только компания — это и есть снимок actorName без изменений;
//   - коллегам внутри одной компании: имена.
//
// Устаревшие строки (до Блока 4: actorId = id КОМПАНИИ, пользователя
// с таким id нет) деградируют честно — показывается снимок компании:
// личность за старыми действиями системе неизвестна.
//
// Файл тянет db (батч-резолв пользователей) — импорт из клиентских
// компонентов запрещён, как и activity.ts/documents.ts. Читатели
// Activity фильтруют видимость сами (eventWhereFor, events-guard) —
// здесь читаются ТОЛЬКО справочники пользователей, журнал не трогается.

// Роль читателя: сотрудник (проекция «Имя (Компания)») или внешний
// кабинет, скоупированный своей компанией (коллеги — имена, чужие —
// компания). id компании у Current* — именно он (Блок 3).
export type ActorNameReader =
  | { kind: 'staff' }
  | { kind: 'client'; customerId: string }
  | { kind: 'broker'; brokerId: string }

// Единственный скоуп роутов админки — константа вместо литерала в
// четырёх местах (дашборд, карточки лида/заявки, конвертация).
export const STAFF_READER: ActorNameReader = { kind: 'staff' }

// Минимальная ссылка на актёра (строка Activity)…
export type ActorRef = {
  actorType: string
  actorId: string | null
  actorName: string
}
// …и на автора (строка DocumentVersion) — та же семантика, другие имена
// колонок (исторические: журнал живёт с Ж2, версии — с Е).
export type AuthorRef = {
  authorType: string
  authorId: string | null
  authorName: string
}

// Нормализованная ссылка — единая точка правил проекции.
type NameRef = { type: string; id: string | null; name: string }

type ResolvedUser = {
  userName: string
  companyName: string
  customerId: string
  brokerId: string
}
export type UserNameMap = Map<string, ResolvedUser>

// ── Батч-резолв пользователей ───────────────────────────────────────
// Два запроса независимо от размера ленты (in-список): лента карточки
// — окно ACTIVITY_FEED_TAKE, дашборд — 30 строк, N+1 исключён.
export async function resolveUserNames(
  refs: readonly (ActorRef | AuthorRef)[],
): Promise<UserNameMap> {
  const clientIds = new Set<string>()
  const brokerIds = new Set<string>()
  for (const r of refs) {
    const ref = 'actorType' in r ? r.actorType : r.authorType
    const id = 'actorType' in r ? r.actorId : r.authorId
    if (!id) continue
    if (ref === 'client') clientIds.add(id)
    else if (ref === 'broker') brokerIds.add(id)
  }

  const map: UserNameMap = new Map()
  if (clientIds.size > 0) {
    const users = await db.customerUser.findMany({
      where: { id: { in: [...clientIds] } },
      select: {
        id: true,
        name: true,
        customerId: true,
        customer: { select: { name: true } },
      },
    })
    for (const u of users) {
      map.set(u.id, {
        userName: u.name,
        companyName: u.customer.name,
        customerId: u.customerId,
        brokerId: '',
      })
    }
  }
  if (brokerIds.size > 0) {
    const users = await db.brokerUser.findMany({
      where: { id: { in: [...brokerIds] } },
      select: {
        id: true,
        name: true,
        brokerId: true,
        broker: { select: { companyName: true } },
      },
    })
    for (const u of users) {
      map.set(u.id, {
        userName: u.name,
        companyName: u.broker.companyName,
        customerId: '',
        brokerId: u.brokerId,
      })
    }
  }
  return map
}

// ── Правило проекции (чистая функция) ───────────────────────────────
// employee/contractor/system — снимок как есть (человек у сотрудника
// свой, у подрядчика людей нет — Г4, у системы имени нет).
export function projectActorName(
  ref: NameRef,
  users: UserNameMap,
  reader: ActorNameReader,
): string {
  if (ref.type !== 'client' && ref.type !== 'broker') return ref.name
  const user = ref.id ? users.get(ref.id) : undefined
  if (reader.kind === 'staff') {
    // «Имя (Компания)»; устаревшая строка (пользователя нет) — компания.
    return user ? `${user.userName} (${user.companyName})` : ref.name
  }
  // Внешний читатель: коллега по СВОЕЙ компании — имя; все остальные
  // (устаревшие строки, чужая компания, другая сторона) — снимок
  // компании. Явные ветки: TS не сужает reader по ref.type.
  if (reader.kind === 'client') {
    return ref.type === 'client' && user && user.customerId === reader.customerId
      ? user.userName
      : ref.name
  }
  return ref.type === 'broker' && user && user.brokerId === reader.brokerId
    ? user.userName
    : ref.name
}

// ── Обёртки для роутов ──────────────────────────────────────────────
// Возвращают НОВЫЕ строки с заменённым отображаемым именем (оригинал
// не мутируется), все остальные поля — без изменений: UI продолжает
// читать actorName/authorName и не знает о механике проекции.

// Лента событий (Activity): actorName → проекция.
export async function projectActors<T extends ActorRef>(
  rows: readonly T[],
  reader: ActorNameReader,
): Promise<T[]> {
  if (rows.length === 0) return []
  const users = await resolveUserNames(rows)
  return rows.map((r) => ({
    ...r,
    actorName: projectActorName(
      { type: r.actorType, id: r.actorId, name: r.actorName },
      users,
      reader,
    ),
  }))
}

// Плоские строки версий (DocumentVersion): authorName → проекция.
export async function projectAuthors<T extends AuthorRef>(
  rows: readonly T[],
  reader: ActorNameReader,
): Promise<T[]> {
  if (rows.length === 0) return []
  const users = await resolveUserNames(rows)
  return rows.map((r) => ({
    ...r,
    authorName: projectActorName(
      { type: r.authorType, id: r.authorId, name: r.authorName },
      users,
      reader,
    ),
  }))
}

// Список документов: authorName во ВСЕХ версиях каждого документа,
// один резолв на весь список (два запроса, не 2×версий).
export async function projectDocumentAuthors<
  T extends { versions: AuthorRef[] },
>(docs: readonly T[], reader: ActorNameReader): Promise<T[]> {
  if (docs.length === 0) return []
  const all = docs.flatMap((d) => d.versions)
  if (all.length === 0) return [...docs]
  const users = await resolveUserNames(all)
  return docs.map((d) => ({
    ...d,
    versions: d.versions.map((v) => ({
      ...v,
      authorName: projectActorName(
        { type: v.authorType, id: v.authorId, name: v.authorName },
        users,
        reader,
      ),
    })),
  }))
}
