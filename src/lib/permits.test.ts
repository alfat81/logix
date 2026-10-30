import { describe, it, expect } from 'vitest'
import {
  CreatePermitSchema,
  PatchPermitSchema,
  fmtPermitDate,
  isPermitOverdue,
  isPermitRed,
  permitHolderKind,
  pickMostUrgentPermit,
  providerLabelFor,
  PERMIT_PROVIDERS,
  PERMIT_STATUSES,
} from '@/lib/permits'

// ─── DF-16 «Разрешительные документы»: чистые правила (unit) ─────────
// Границы красного окна, срочность pickMostUrgentPermit, держатель мяча
// по providedBy, подписи сторон и схемы API. Даты фиксированы —
// 31 октября 2026 (UTC-полночь, как хранится neededBy из формы).

const NOW = new Date(Date.UTC(2026, 9, 31, 12, 0, 0))
const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('isPermitRed (красное окно D35)', () => {
  it('до срока больше red_days_before → не красный', () => {
    // 31.10 12:00 → 04.11 00:00: 3.5 суток > 3
    expect(isPermitRed(D('2026-11-04'), NOW, 3)).toBe(false)
  })
  it('ровно на границе (3 суток) → красный (<=)', () => {
    // 31.10 12:00 → 03.11 00:00: ровно 3 суток
    expect(isPermitRed(D('2026-11-03'), NOW, 3)).toBe(true)
  })
  it('срок прошёл → красный', () => {
    expect(isPermitRed(D('2026-10-30'), NOW, 3)).toBe(true)
  })
  it('без дней (0) — красный только в день срока и позже', () => {
    expect(isPermitRed(D('2026-11-01'), NOW, 0)).toBe(false)
    expect(isPermitRed(D('2026-10-31'), NOW, 0)).toBe(true)
  })
})

describe('isPermitOverdue (просрочка — для плашки/письма)', () => {
  it('строгое <: срок сегодня (UTC-полночь) — ещё НЕ просрочен', () => {
    const midnight = new Date(Date.UTC(2026, 9, 31, 0, 0, 0))
    expect(isPermitOverdue(D('2026-10-31'), midnight)).toBe(false)
  })
  it('после полуночи срока — просрочен', () => {
    expect(isPermitOverdue(D('2026-10-31'), NOW)).toBe(true)
    expect(isPermitOverdue(D('2026-10-30'), NOW)).toBe(true)
  })
})

describe('pickMostUrgentPermit (срочность строки для мяча/плашки)', () => {
  const row = (over: {
    providedBy?: 'client' | 'broker' | 'staff'
    isBlocking?: boolean
    neededBy?: Date | null
    createdAt?: Date
  }) => ({
    providedBy: over.providedBy ?? 'client',
    isBlocking: over.isBlocking ?? false,
    neededBy: over.neededBy === undefined ? D('2026-11-05') : over.neededBy,
    createdAt: over.createdAt ?? D('2026-10-30'),
  })

  it('пустой список → null', () => {
    expect(pickMostUrgentPermit([])).toBeNull()
  })
  it('блокирующая важнее неблокирующей', () => {
    const best = pickMostUrgentPermit([
      row({ neededBy: D('2026-11-01') }), // раньше, но не blocking
      row({ isBlocking: true, neededBy: D('2026-11-10') }),
    ])
    expect(best?.isBlocking).toBe(true)
  })
  it('среди неблокирующих — ближайший срок; без срока — в конце', () => {
    const best = pickMostUrgentPermit([
      row({ neededBy: null }),
      row({ neededBy: D('2026-11-02') }),
      row({ neededBy: D('2026-11-01') }),
    ])
    expect(best?.neededBy).toEqual(D('2026-11-01'))
  })
  it('при равном сроке — старейшая строка', () => {
    const older = row({ neededBy: D('2026-11-01'), createdAt: D('2026-10-01') })
    const newer = row({ neededBy: D('2026-11-01'), createdAt: D('2026-10-29') })
    expect(pickMostUrgentPermit([newer, older])).toBe(older)
  })
})

describe('permitHolderKind и providerLabelFor (держатель мяча, подписи)', () => {
  it('providedBy → вид держателя мяча', () => {
    expect(permitHolderKind('client')).toBe('client')
    expect(permitHolderKind('broker')).toBe('broker')
    expect(permitHolderKind('staff')).toBe('manager')
  })
  it('подписи: свои обязательства — «вас», чужие — по имени стороны', () => {
    expect(providerLabelFor('client', 'client')).toBe('вас')
    expect(providerLabelFor('broker', 'broker')).toBe('вас')
    expect(providerLabelFor('client', 'staff')).toBe('клиент')
    expect(providerLabelFor('client', 'broker')).toBe('клиент')
    expect(providerLabelFor('broker', 'client')).toBe('брокер')
    expect(providerLabelFor('staff', 'client')).toBe('сотрудник')
  })
})

describe('fmtPermitDate (дата плашек/писем по UTC)', () => {
  it('дд.мм.гггг', () => {
    expect(fmtPermitDate(D('2026-11-05'))).toBe('05.11.2026')
  })
  it('null/undefined → тире', () => {
    expect(fmtPermitDate(null)).toBe('—')
    expect(fmtPermitDate(undefined)).toBe('—')
  })
})

describe('константы домена', () => {
  it('кто предоставляет и статусы строки — точный состав', () => {
    expect(PERMIT_PROVIDERS).toEqual(['client', 'broker', 'staff'])
    expect(PERMIT_STATUSES).toEqual(['pending', 'received', 'waived'])
  })
})

describe('CreatePermitSchema (POST /permits)', () => {
  it('минимально корректный ввод', () => {
    const parsed = CreatePermitSchema.safeParse({ title: 'Фитосанитарный сертификат', providedBy: 'client' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.isBlocking).toBeUndefined() // дефолт false — в БД-слое
      expect(parsed.data.neededBy).toBeUndefined()
    }
  })
  it('пустое/длинное название — ошибка', () => {
    expect(CreatePermitSchema.safeParse({ title: '   ', providedBy: 'client' }).success).toBe(false)
    expect(CreatePermitSchema.safeParse({ title: 'x'.repeat(201), providedBy: 'client' }).success).toBe(false)
  })
  it('неизвестный providedBy — ошибка', () => {
    expect(CreatePermitSchema.safeParse({ title: 'Д', providedBy: 'contractor' }).success).toBe(false)
  })
  it('нужен формат даты ГГГГ-ММ-ДД, некорректная дата — ошибка', () => {
    expect(CreatePermitSchema.safeParse({ title: 'Д', providedBy: 'client', neededBy: '2026-11-05' }).success).toBe(true)
    expect(CreatePermitSchema.safeParse({ title: 'Д', providedBy: 'client', neededBy: '05.11.2026' }).success).toBe(false)
    expect(CreatePermitSchema.safeParse({ title: 'Д', providedBy: 'client', neededBy: '2026-13-40' }).success).toBe(false)
  })
  it('staffNote/itemId — необязательные, с потолками длины', () => {
    expect(
      CreatePermitSchema.safeParse({ title: 'Д', providedBy: 'client', staffNote: 'ок', itemId: 'item-1' }).success
    ).toBe(true)
    expect(
      CreatePermitSchema.safeParse({ title: 'Д', providedBy: 'client', staffNote: 'x'.repeat(1001) }).success
    ).toBe(false)
  })
})

describe('PatchPermitSchema (PATCH /admin/permits/[id])', () => {
  it('пустой объект — «нечего обновлять»', () => {
    expect(PatchPermitSchema.safeParse({}).success).toBe(false)
  })
  it('правка полей строки', () => {
    expect(PatchPermitSchema.safeParse({ title: 'Новое название', isBlocking: true }).success).toBe(true)
  })
  it('waived с причиной и без', () => {
    expect(PatchPermitSchema.safeParse({ status: 'waived', waivedReason: 'не требуется' }).success).toBe(true)
    // Причину требует БД-слой (patchPermit), схема пропускает пустую —
    // контракт одной валидации не двоится (уровни разделены)
    expect(PatchPermitSchema.safeParse({ status: 'waived' }).success).toBe(true)
  })
  it('status received схемой не запрещён — запрет в patchPermit (400), контракт документирован', () => {
    expect(PatchPermitSchema.safeParse({ status: 'received' }).success).toBe(true)
  })
})
