import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { employeeActor } from '@/lib/activity'
import {
  SETTINGS,
  SETTING_GROUP_LABELS,
  getSettingDef,
  setSetting,
  resetSetting,
  SettingValidationError,
  type SettingDef,
  type SettingKey,
} from '@/lib/settings'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── Настройки системы (DF-00D, D32, инвариант 9) ──────────────────
// Чтение реестра и запись значений. Раздел мастер-only ЦЕЛИКОМ (как
// Ж6в-сотрудники): настройки — внутренняя кухня системы, менеджеру
// не нужны; меню «Настройки» тоже видно только мастеру (AdminNav).
// API — единственная защита, экран — удобство.
//
// Свободные ключи не допускаются: PATCH/DELETE принимают только ключи
// реестра SETTINGS, значение прогоняется через валидатор ключа
// (getSettingDef/setSetting). Каждое фактическое изменение пишется
// событием setting_changed (emitEvent внутри setSetting/resetSetting,
// аудитория staff, старое → новое, без секретов) в той же транзакции,
// что и запись — инвариант 2.

// Публичная запись настройки для экрана: реестр + текущее состояние.
// value приходит из БД как JsonValue (может миновать типы) — каст
// честный: пишут значение только через валидатор реестра (паттерн
// getSetting в lib/settings.ts).
function settingEntry(def: SettingDef, row: { value: unknown; updatedByName: string; updatedAt: Date } | null) {
  return {
    key: def.key,
    group: def.group,
    uiType: def.uiType,
    label: def.label,
    hint: def.hint,
    defaultValue: def.defaultValue,
    // Эффективное значение: строка БД, а без неё — дефолт (пустая
    // таблица легитимна, система работает до первого изменения).
    value: (row ? row.value : def.defaultValue) as string | number | string[],
    isModified: row !== null,
    updatedByName: row?.updatedByName ?? null,
    updatedAt: row?.updatedAt ?? null,
  }
}

// ─── GET — реестр с текущими значениями (мастер) ───────────────────
export async function GET(req: NextRequest) {
  // roles без write: чтение, но привилегированное (паттерн Ж6в).
  const auth = await requireEmployee(req, { roles: ['master'] })
  if (!auth.ok) return auth.response

  try {
    const rows = await db.setting.findMany()
    const byKey = new Map(rows.map((r) => [r.key, r]))
    return NextResponse.json({
      groups: SETTING_GROUP_LABELS,
      settings: SETTINGS.map((def) => settingEntry(def, byKey.get(def.key) ?? null)),
    })
  } catch (e) {
    return apiErrorResponse(e, 'settings GET', 'Не удалось загрузить настройки')
  }
}

// Тело PATCH/DELETE: конверт приходит из JSON — типы не спасают,
// рантайм-проверка ключа обязательна (каст ниже честно помечен).
type SettingBody = { key: string; value?: unknown }

async function readBody(req: NextRequest): Promise<SettingBody | null> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null) return null
  const key = (body as Record<string, unknown>).key
  if (typeof key !== 'string' || !key) return null
  return { key, value: (body as Record<string, unknown>).value }
}

// ─── PATCH — изменить значение (мастер, событие в транзакции) ──────
export async function PATCH(req: NextRequest) {
  const auth = await requireEmployee(req, { write: true, roles: ['master'] })
  if (!auth.ok) return auth.response

  const body = await readBody(req)
  if (!body) {
    return NextResponse.json({ error: 'Ожидаются поля key и value' }, { status: 400 })
  }

  try {
    const def = getSettingDef(body.key) // неизвестный ключ → 400 (D32)
    await db.$transaction(async (tx) =>
      setSetting(body.key as SettingKey, body.value, employeeActor(auth.employee), tx)
    )
    const row = await db.setting.findUnique({ where: { key: def.key } })
    return NextResponse.json({ setting: settingEntry(def, row) })
  } catch (e) {
    if (e instanceof SettingValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    return apiErrorResponse(e, 'settings PATCH', 'Не удалось сохранить настройку')
  }
}

// ─── DELETE — «сбросить» на значение по умолчанию (мастер) ─────────
// Строка удаляется, getSetting возвращается к дефолту; сброс
// отсутствующей строки — no-op без события (семантика resetSetting).
export async function DELETE(req: NextRequest) {
  const auth = await requireEmployee(req, { write: true, roles: ['master'] })
  if (!auth.ok) return auth.response

  const body = await readBody(req)
  if (!body) {
    return NextResponse.json({ error: 'Ожидается поле key' }, { status: 400 })
  }

  try {
    const def = getSettingDef(body.key)
    await db.$transaction(async (tx) => resetSetting(body.key as SettingKey, employeeActor(auth.employee), tx))
    return NextResponse.json({ setting: settingEntry(def, null) })
  } catch (e) {
    if (e instanceof SettingValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    return apiErrorResponse(e, 'settings DELETE', 'Не удалось сбросить настройку')
  }
}
