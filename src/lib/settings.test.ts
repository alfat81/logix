import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest'
import { db } from './db'
import {
  SETTINGS,
  SETTING_GROUPS,
  SETTING_GROUP_LABELS,
  getSetting,
  getSettingDef,
  setSetting,
  resetSetting,
  clearSettingsCache,
  SettingValidationError,
  type SettingKey,
} from './settings'
import { employeeActor } from './activity'

// ─── DF-00D «Настройки системы»: реестр, валидаторы, кэш, get/set ────
// Уровень: реестр/валидаторы — чистые; get/set — интеграционный против
// реального PostgreSQL (как events.test.ts): IC-15 полнота, валидаторы
// ЧЧ:ММ/пояса/границ, кэш ≤ 60 с, откат на дефолт, событие setting_changed.

const RUN = 'df00d-settings-test'
const MASTER = employeeActor({ id: 'df00d-test', name: 'Мастер DF-00D' })

// Ключи карточки DF-00D — защита от случайного переименования (IC-15).
const CARD_KEYS = [
  // notifications (8)
  'notifications.client_digest_times', 'notifications.timezone',
  'notifications.max_regular_per_day', 'notifications.immediate_phases',
  'notifications.red_event_types', 'notifications.red_max_per_hour', 'notifications.staff_mode',
  // DF-03: префикс темы красных писем (карточка DF-03, «из настроек»)
  'notifications.red_subject_prefix',
  // owner_digest (2) · waiting (1) · permits (2) · files (1)
  'owner_digest.window_start', 'owner_digest.window_end', 'waiting.attention_hours',
  'permits.red_days_before', 'permits.remind_every_days', 'files.max_mb',
  // brand (2) · email (2)
  'brand.name', 'brand.signature', 'email.from_name', 'email.reply_to',
]

const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(async () => {
  clearSettingsCache()
  await db.setting.deleteMany({})
  // События тоже чистим: без этого находка «события нет» поймает
  // событие предыдущего теста (изоляция описов).
  await db.activity.deleteMany({ where: { type: 'setting_changed' } })
})

afterAll(async () => {
  await db.setting.deleteMany({})
  await db.activity.deleteMany({ where: { type: 'setting_changed' } })
  consoleSpy.mockRestore()
})

describe('Реестр SETTINGS — полнота и самосогласованность', () => {
  it('содержит ровно ключи карточки DF-00D', () => {
    expect(SETTINGS.map((d) => d.key).sort()).toEqual([...CARD_KEYS].sort())
  })

  it('ключи уникальны, группы валидны и подписаны', () => {
    const keys = SETTINGS.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const d of SETTINGS) {
      expect(SETTING_GROUPS, `${d.key}: группа`).toContain(d.group)
      expect(SETTING_GROUP_LABELS[d.group], `${d.key}: подпись группы`).toBeTruthy()
    }
  })

  it('у каждого ключа: подпись, подсказка, дефолт и валидатор (IC-15)', () => {
    for (const d of SETTINGS) {
      expect(d.label.trim(), `${d.key}: label`).not.toBe('')
      expect(d.hint.trim(), `${d.key}: hint`).not.toBe('')
      expect(() => d.validate(d.defaultValue), `${d.key}: дефолт валиден`).not.toThrow()
      expect(d.validate(d.defaultValue), `${d.key}: validate нормализует`).toEqual(d.defaultValue)
    }
  })

  it('uiType соответствует форме дефолта (рендер экрана, Блок 4)', () => {
    for (const d of SETTINGS) {
      const v = d.defaultValue
      if (d.uiType === 'number') expect(typeof v, d.key).toBe('number')
      else if (d.uiType === 'time' || d.uiType === 'string' || d.uiType === 'text') {
        expect(typeof v, d.key).toBe('string')
      } else {
        expect(Array.isArray(v), d.key).toBe(true)
        for (const item of v as string[]) expect(typeof item, `${d.key}: пункт`).toBe('string')
      }
    }
  })

  it('красные события по умолчанию пусты,staff_mode = immediate (карточка)', () => {
    expect(getSettingDef('notifications.red_event_types').defaultValue).toEqual([])
    expect(getSettingDef('notifications.staff_mode').defaultValue).toBe('immediate')
  })

  it('неизвестный ключ — SettingValidationError, свободные ключи закрыты', () => {
    expect(() => getSettingDef('hacker.key')).toThrow(SettingValidationError)
  })
})

describe('Валидаторы (карточка DF-00D: формат, пояс, границы)', () => {
  it('время: ЧЧ:ММ 00:00–23:59, trim; мусор отклоняется', () => {
    const def = getSettingDef('owner_digest.window_start')
    expect(def.validate(' 09:05 ')).toBe('09:05')
    for (const bad of ['9:00', '24:00', '09:60', '09-00', '', '9:000', 900]) {
      expect(() => def.validate(bad), `bad: ${String(bad)}`).toThrow(SettingValidationError)
    }
  })

  it('список времён: без пустых и повторов, сортировка хронологическая', () => {
    const def = getSettingDef('notifications.client_digest_times')
    expect(def.validate(['16:00', '09:00'])).toEqual(['09:00', '16:00'])
    expect(() => def.validate([])).toThrow(/хотя бы один час/)
    expect(() => def.validate(['09:00', '09:00'])).toThrow(/не должны повторяться/)
    expect(() => def.validate(['09:00', 'день'])).toThrow(SettingValidationError)
  })

  it('числа: целые в границах ключа; дробные и вне границ — ошибка', () => {
    expect(getSettingDef('files.max_mb').validate(200)).toBe(200)
    expect(getSettingDef('files.max_mb').validate(1)).toBe(1)
    for (const bad of [0, 201, 12.5, '25', null]) {
      expect(() => getSettingDef('files.max_mb').validate(bad), `bad: ${String(bad)}`).toThrow(
        SettingValidationError,
      )
    }
    expect(() => getSettingDef('permits.red_days_before').validate(-1)).toThrow(SettingValidationError)
  })

  it('часовой пояс: существующий IANA принимается, выдуманный — нет', () => {
    const def = getSettingDef('notifications.timezone')
    expect(def.validate('Europe/Moscow')).toBe('Europe/Moscow')
    expect(() => def.validate('Mars/Olympus_Mons')).toThrow(/часовой пояс/)
  })

  it('email.reply_to: пусто или корректный адрес', () => {
    const def = getSettingDef('email.reply_to')
    expect(def.validate('')).toBe('')
    expect(def.validate('  ')).toBe('')
    expect(def.validate('notify@fatyanov.com')).toBe('notify@fatyanov.com')
    expect(() => def.validate('notify@')).toThrow(SettingValidationError)
  })

  it('staff_mode: только значения из белого списка', () => {
    const def = getSettingDef('notifications.staff_mode')
    expect(def.validate('digest')).toBe('digest')
    expect(() => def.validate('instant')).toThrow(/Одно из значений/)
  })

  it('red_event_types: только коды ACTIVITY_TYPES; пустой список легитимен', () => {
    const def = getSettingDef('notifications.red_event_types')
    expect(def.validate([])).toEqual([])
    expect(def.validate(['lead_created'])).toEqual(['lead_created'])
    expect(() => def.validate(['no_such_event'])).toThrow(/не код из реестра/)
    expect(() => def.validate([123])).toThrow(SettingValidationError)
  })

  it('immediate_phases: строки без повторов; пустой список допустим', () => {
    const def = getSettingDef('notifications.immediate_phases')
    expect(def.validate([])).toEqual([])
    expect(() => def.validate([' расчёт ', 'расчёт'])).toThrow(/не должны повторяться/)
    expect(def.validate(['расчёт'])).toEqual(['расчёт'])
  })

  it('brand.name: непустая строка с потолком длины; brand.signature пустой легитимен', () => {
    expect(() => getSettingDef('brand.name').validate('   ')).toThrow(/не может быть пустым/)
    expect(() => getSettingDef('brand.name').validate('x'.repeat(101))).toThrow(/100 символов/)
    expect(getSettingDef('brand.signature').validate('')).toBe('')
    expect(() => getSettingDef('brand.signature').validate('x'.repeat(501))).toThrow(/500 символов/)
  })
})

describe('getSetting — кэш ≤ 60 с и откат на дефолт', () => {
  it('пустая таблица → значения по умолчанию (система работает до первого изменения)', async () => {
    expect(await getSetting('files.max_mb')).toBe(25)
    expect(await getSetting('notifications.client_digest_times')).toEqual(['09:00', '16:00'])
    expect(await getSetting('brand.name')).toBe('Logix')
  })

  it('строка БД сильнее дефолта; повторное чтение в пределах TTL не ходит в БД', async () => {
    const spy = vi.spyOn(db.setting, 'findUnique')
    await db.setting.create({ data: { key: 'files.max_mb', value: 50, updatedByName: RUN } })
    clearSettingsCache()
    expect(await getSetting('files.max_mb')).toBe(50)
    expect(await getSetting('files.max_mb')).toBe(50)
    expect(spy).toHaveBeenCalledTimes(1) // второй раз — из кэша
    spy.mockRestore()
  })

  it('TTL: после 60 с кэш устаревает, из БД подхватывается новое значение', async () => {
    const realNow = Date.now()
    let offsetMs = 0
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => realNow + offsetMs)
    try {
      await db.setting.create({ data: { key: 'files.max_mb', value: 50, updatedByName: RUN } })
      clearSettingsCache()
      expect(await getSetting('files.max_mb')).toBe(50) // кэшируется на realNow+60с
      await db.setting.update({ where: { key: 'files.max_mb' }, data: { value: 30 } })
      expect(await getSetting('files.max_mb')).toBe(50) // ещё в пределах TTL — старое
      offsetMs = 61_000
      expect(await getSetting('files.max_mb')).toBe(30) // TTL истёк — свежее
    } finally {
      nowSpy.mockRestore()
    }
  })
})

describe('setSetting — запись + событие setting_changed', () => {
  async function lastChangeEvent(descriptionPart: string) {
    return db.activity.findFirst({
      where: { type: 'setting_changed', description: { contains: descriptionPart } },
      orderBy: { createdAt: 'desc' },
    })
  }

  it('валидное значение: строка Setting + событие staff без цели, старое → новое', async () => {
    const returned = await setSetting('files.max_mb', 50, MASTER)
    expect(returned).toBe(50)
    const row = await db.setting.findUnique({ where: { key: 'files.max_mb' } })
    expect(row!.value).toBe(50)
    expect(row!.updatedByName).toBe('Мастер DF-00D')
    const ev = await lastChangeEvent('files.max_mb')
    expect(ev).not.toBeNull()
    expect(ev!.audience).toEqual(['staff'])
    expect(ev!.actorType).toBe('employee')
    expect(ev!.actorName).toBe('Мастер DF-00D')
    expect(ev!.orderId).toBeNull()
    expect(ev!.leadId).toBeNull()
    expect(ev!.contractorId).toBeNull()
    expect(ev!.description).toContain('«25»')
    expect(ev!.description).toContain('«50»')
  })

  it('кэш сбрасывается сразу: getSetting после setSetting видит новое', async () => {
    await setSetting('waiting.attention_hours', 48, MASTER)
    expect(await getSetting('waiting.attention_hours')).toBe(48)
  })

  it('невалидное значение: SettingValidationError, записи и события нет', async () => {
    await expect(setSetting('files.max_mb', 0, MASTER)).rejects.toThrow(SettingValidationError)
    await expect(setSetting('files.max_mb', 'много', MASTER)).rejects.toThrow(SettingValidationError)
    expect(await db.setting.findUnique({ where: { key: 'files.max_mb' } })).toBeNull()
    expect(await lastChangeEvent('files.max_mb')).toBeNull()
  })

  it('неизвестный ключ отклоняется (свободных ключей нет, D32)', async () => {
    // Ключ приходит из JSON роута — типизация обманывается кастом,
    // рантайм-гард getSettingDef — единственная защита (проверяем её).
    await expect(setSetting('hacker.key' as SettingKey, 'x', MASTER)).rejects.toThrow(
      SettingValidationError,
    )
  })

  it('повторное сохранение того же значения — no-op без события', async () => {
    await setSetting('files.max_mb', 50, MASTER)
    const eventsAfterFirst = await db.activity.count({ where: { type: 'setting_changed' } })
    const again = await setSetting('files.max_mb', 50, MASTER)
    expect(again).toBe(50)
    expect(await db.activity.count({ where: { type: 'setting_changed' } })).toBe(eventsAfterFirst)
  })

  it('нормализация до no-op: «16:00,09:00» при дефолте 09:00/16:00 — без события', async () => {
    const eventsBefore = await db.activity.count({ where: { type: 'setting_changed' } })
    await setSetting('notifications.client_digest_times', ['16:00', '09:00'], MASTER)
    expect(await db.activity.count({ where: { type: 'setting_changed' } })).toBe(eventsBefore)
  })

  it('ошибка после записи откатывает и значение, и событие (DoD 4.5, инвариант 2)', async () => {
    // Роут Блока 4 передаёт tx из $transaction: сбой операции после
    // setSetting обязан откатить и строку Setting, и событие в ленте.
    await expect(
      db.$transaction(async (tx) => {
        await setSetting('files.max_mb', 50, MASTER, tx)
        throw new Error('Simulated failure after setSetting (DF-00D)')
      })
    ).rejects.toThrow('Simulated failure after setSetting')
    expect(await db.setting.findUnique({ where: { key: 'files.max_mb' } })).toBeNull()
    expect(
      await db.activity.count({ where: { type: 'setting_changed', description: { contains: 'files.max_mb' } } })
    ).toBe(0)
  })

  it('список: значение и событие с массивом в описании', async () => {
    await setSetting('notifications.immediate_phases', ['расчёт'], MASTER)
    const row = await db.setting.findUnique({ where: { key: 'notifications.immediate_phases' } })
    expect(row!.value).toEqual(['расчёт'])
    const ev = await lastChangeEvent('notifications.immediate_phases')
    expect(ev!.description).toContain('«расчёт»')
  })
})

describe('resetSetting — «сбросить» экрана настроек', () => {
  it('удаляет строку, getSetting возвращается к дефолту, событие пишется', async () => {
    await setSetting('files.max_mb', 50, MASTER)
    await resetSetting('files.max_mb', MASTER)
    expect(await db.setting.findUnique({ where: { key: 'files.max_mb' } })).toBeNull()
    expect(await getSetting('files.max_mb')).toBe(25)
    const ev = await db.activity.findFirst({
      where: { type: 'setting_changed', description: { contains: 'значение по умолчанию' } },
      orderBy: { createdAt: 'desc' },
    })
    expect(ev!.description).toContain('files.max_mb')
    expect(ev!.description).toContain('«25»')
  })

  it('сброс отсутствующей строки — no-op без события', async () => {
    const eventsBefore = await db.activity.count({ where: { type: 'setting_changed' } })
    await resetSetting('brand.signature', MASTER)
    expect(await db.activity.count({ where: { type: 'setting_changed' } })).toBe(eventsBefore)
  })
})
