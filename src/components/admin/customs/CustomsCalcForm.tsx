'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { IncotermPicker } from '@/components/references/IncotermPicker'
import { CustomsItemsEditor } from './CustomsItemsEditor'
import { CustomsFxInputs } from './CustomsFxInputs'
import { useIncotermFlags } from './use-incoterm-flags'
import type { CustomsCalcRow, EstimatePrefill, FormItem, FreightSuggest } from './types'

// ─── DF-19: форма расчёта таможенных платежей (редактируемый черновик,
// D40). Показываются только нужные условию поставки поля (meta
// справочника DF-17); сервер пересчитывает и снимает курсы/шкалу/запас.

// «1 234,56» → 1234.56; пусто/мусор → null (валидация — на сервере)
const numOrNull = (v: string): number | null =>
  v.trim() === '' || !Number.isFinite(Number(v.replace(',', '.'))) ? null : Number(v.replace(',', '.'))
// Запасной список валют до ответа /api/ref/currency (IC-16)
const FALLBACK_CURRENCIES = [
  { code: 'RUB', name: 'Рубль' },
  { code: 'USD', name: 'Доллар США' },
  { code: 'EUR', name: 'Евро' },
  { code: 'CNY', name: 'Юань' },
]

export function CustomsCalcForm({
  targetType,
  targetId,
  initial,
  initialIncoterm,
  initialPlace,
  freightSuggest,
  estimates,
  onDone,
  onCancel,
}: {
  targetType: 'lead' | 'order'
  targetId: string
  initial: CustomsCalcRow | null
  initialIncoterm?: string | null
  initialPlace?: string | null
  freightSuggest: FreightSuggest
  estimates: EstimatePrefill[]
  onDone: () => void
  onCancel: () => void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [incoterm, setIncoterm] = useState(initial?.incoterm ?? initialIncoterm ?? '')
  const [place, setPlace] = useState(initial?.incotermPlace ?? initialPlace ?? '')
  const [calcDate, setCalcDate] = useState(initial ? initial.calcDate.slice(0, 10) : '')
  const [fxDate, setFxDate] = useState(initial ? initial.fxDate.slice(0, 10) : '')
  const [freightTotal, setFreightTotal] = useState(
    initial ? String(initial.freightTotal) : freightSuggest ? String(freightSuggest.amount) : ''
  )
  const [freightCurrency, setFreightCurrency] = useState(initial?.freightCurrency ?? freightSuggest?.currency ?? 'USD')
  const [freightToArrival, setFreightToArrival] = useState(
    initial ? (initial.freightToArrival == null ? '' : String(initial.freightToArrival)) : ''
  )
  const [insurance, setInsurance] = useState(initial ? String(initial.insurance) : '')
  const [otherCosts, setOtherCosts] = useState(initial ? String(initial.otherCosts) : '')
  const [brokerFeeRub, setBrokerFeeRub] = useState(initial?.brokerFeeRub == null ? '' : String(initial.brokerFeeRub))
  const [feeRubManual, setFeeRubManual] = useState(initial?.feeRub == null || !initial.feeManual ? '' : String(initial.feeRub))
  const [fxManual, setFxManual] = useState<Record<string, string>>({})
  const [overrideFreight, setOverrideFreight] = useState<'weight' | 'value'>(initial?.allocationOverride?.freight ?? 'weight')
  const [overrideOther, setOverrideOther] = useState<'weight' | 'value'>(initial?.allocationOverride?.other ?? 'value')
  const [rows, setRows] = useState<FormItem[]>(() =>
    initial
      ? initial.items.map((it) => ({
          brokerItemId: it.brokerItemId,
          hsCode: it.hsCode,
          goodsValue: String(it.goodsValue),
          goodsCurrency: it.goodsCurrency,
          netWeightKg: String(it.netWeightKg),
          dutyPercent: it.dutyPercent == null ? '' : String(it.dutyPercent),
          addDutyPercent: it.addDutyPercent == null ? '' : String(it.addDutyPercent),
          vatPercent: it.vatPercent == null ? '' : String(it.vatPercent),
        }))
      : []
  )
  const [currencyOptions, setCurrencyOptions] = useState(FALLBACK_CURRENCIES)
  // IC-16: выбор валюты — из справочника (запасной список — до ответа API)
  useEffect(() => {
    let cancelled = false
    fetch('/api/ref/currency')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) return
        const items = (body.items ?? []) as { code: string; name: string }[]
        if (!cancelled && items.length > 0) setCurrencyOptions(items.map((c) => ({ code: c.code, name: c.name })))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const flags = useIncotermFlags(incoterm)
  const usedCurrencies = useMemo(
    () => [...new Set([freightCurrency.toUpperCase(), ...rows.map((r) => r.goodsCurrency.toUpperCase())])].filter((c) => c && c !== 'RUB'),
    [freightCurrency, rows]
  )

  // fix1: запятая → точка при отправке (формат cbr.ru; сервер до fix1
  // отвергал запятую) — курс «80,9604» превращается в «80.9604»
  const manualRates: Record<string, string> = Object.fromEntries(
    Object.entries(fxManual)
      .filter(([, v]) => v.trim() !== '')
      .map(([code, v]) => [code, v.trim().replace(',', '.')])
  )

  const canSubmit =
    !!incoterm &&
    rows.length > 0 &&
    rows.every((r) => r.hsCode && numOrNull(r.goodsValue) != null && numOrNull(r.netWeightKg) != null)

  const submit = async (asNewVersion: boolean): Promise<void> => {
    setBusy(true)
    try {
      const body = {
        incoterm,
        incotermPlace: place.trim() || null,
        ...(calcDate ? { calcDate } : {}),
        ...(fxDate ? { fxDate } : {}),
        ...(Object.keys(manualRates).length > 0 ? { fxRatesManual: manualRates } : {}),
        freightTotal: numOrNull(freightTotal) ?? 0,
        freightCurrency,
        freightToArrival:
          flags.addFreightToArrival || flags.deductPostArrival ? (numOrNull(freightToArrival) ?? null) : null,
        insurance: numOrNull(insurance) ?? 0,
        otherCosts: numOrNull(otherCosts) ?? 0,
        brokerFeeRub: numOrNull(brokerFeeRub),
        ...(overrideFreight !== 'weight' || overrideOther !== 'value'
          ? { allocationOverride: { freight: overrideFreight, other: overrideOther } }
          : {}),
        feeRubManual: numOrNull(feeRubManual),
        items: rows.map((r) => ({
          ...(r.brokerItemId ? { brokerItemId: r.brokerItemId } : {}),
          hsCode: r.hsCode,
          goodsValue: numOrNull(r.goodsValue) ?? 0,
          goodsCurrency: r.goodsCurrency,
          netWeightKg: numOrNull(r.netWeightKg) ?? 0,
          dutyPercent: numOrNull(r.dutyPercent),
          addDutyPercent: numOrNull(r.addDutyPercent),
          vatPercent: numOrNull(r.vatPercent),
        })),
      }
      const editing = initial != null && !asNewVersion
      const res = await fetch(
        editing
          ? `/api/admin/customs-calculations/${initial.id}`
          : `/api/admin/${targetType}s/${targetId}/customs-calculations`,
        { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      )
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить расчёт')
      toast({ title: asNewVersion && initial ? 'Сохранено новой версией' : 'Расчёт сохранён' })
      onDone()
    } catch (e) {
      toast({ title: 'Ошибка', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const freightLabel =
    flags.deductPostArrival && !flags.addFreightToArrival ? 'Фрахт в цене товара (для вычета заполните часть до прибытия)' : 'Фрахт по счёту'

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <IncotermPicker value={incoterm} onPick={(p) => setIncoterm(p?.code ?? '')} label="Условия поставки" />
        <Label className="grid gap-1.5">
          <span className="text-sm">Место условия поставки</span>
          <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Истанбул, TR" />
        </Label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(flags.addFreightToArrival || flags.deductPostArrival) && (
          <>
            <Label className="grid gap-1.5">
              <span className="text-sm">{freightLabel}</span>
              <Input inputMode="decimal" value={freightTotal} onChange={(e) => setFreightTotal(e.target.value)} placeholder="0,00" />
            </Label>
            <Label className="grid gap-1.5">
              <span className="text-sm">Валюта фрахта</span>
              <select
                aria-label="Валюта фрахта"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={freightCurrency}
                onChange={(e) => setFreightCurrency(e.target.value)}
              >
                {currencyOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </Label>
            <Label className="grid gap-1.5">
              <span className="text-sm">
                {flags.addFreightToArrival ? 'Фрахт до места прибытия (пусто — целиком)' : 'Фрахт до прибытия (из цены)'}
              </span>
              <Input inputMode="decimal" value={freightToArrival} onChange={(e) => setFreightToArrival(e.target.value)} placeholder="—" />
            </Label>
          </>
        )}
        <Label className="grid gap-1.5">
          <span className="text-sm">
            {flags.addInsurance ? 'Страхование (сверх цены)' : 'Страхование (если понесено сверх цены)'}
          </span>
          <Input inputMode="decimal" value={insurance} onChange={(e) => setInsurance(e.target.value)} placeholder="0,00" />
        </Label>
        <Label className="grid gap-1.5">
          <span className="text-sm">Погрузка/разгрузка, посредники, упаковка</span>
          <Input inputMode="decimal" value={otherCosts} onChange={(e) => setOtherCosts(e.target.value)} placeholder="0,00" />
        </Label>
        <Label className="grid gap-1.5">
          <span className="text-sm">Вознаграждение брокера за ДТ, ₽</span>
          <Input inputMode="decimal" value={brokerFeeRub} onChange={(e) => setBrokerFeeRub(e.target.value)} placeholder="вне платежей" />
        </Label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Label className="grid gap-1.5">
          <span className="text-sm">Дата регистрации ДТ</span>
          <Input type="date" value={calcDate} onChange={(e) => setCalcDate(e.target.value)} />
        </Label>
        <Label className="grid gap-1.5">
          <span className="text-sm">Дата курса ЦБ</span>
          <Input type="date" value={fxDate} onChange={(e) => setFxDate(e.target.value)} />
        </Label>
        <Label className="grid gap-1.5">
          <span className="text-sm">Сбор вручную, ₽ (пусто — по шкале)</span>
          <Input inputMode="decimal" value={feeRubManual} onChange={(e) => setFeeRubManual(e.target.value)} placeholder="по шкале ПП № 1637" />
        </Label>
      </div>

      <CustomsFxInputs
        usedCurrencies={usedCurrencies}
        values={fxManual}
        onChange={(code, value) => setFxManual((prev) => ({ ...prev, [code]: value }))}
        disabled={busy}
      />

      <CustomsItemsEditor rows={rows} onChange={setRows} currencyOptions={currencyOptions} estimates={estimates} disabled={busy} />

      {rows.length > 1 && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Label className="grid gap-1.5">
            <span className="text-sm">Распределение перевозки</span>
            <select
              aria-label="Метод распределения перевозки"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={overrideFreight}
              onChange={(e) => setOverrideFreight(e.target.value === 'value' ? 'value' : 'weight')}
            >
              <option value="weight">по весу нетто (ДТС-1)</option>
              <option value="value">по стоимости</option>
            </select>
          </Label>
          <Label className="grid gap-1.5">
            <span className="text-sm">Распределение прочих расходов</span>
            <select
              aria-label="Метод распределения прочих расходов"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={overrideOther}
              onChange={(e) => setOverrideOther(e.target.value === 'weight' ? 'weight' : 'value')}
            >
              <option value="value">по стоимости (ДТС-1)</option>
              <option value="weight">по весу нетто</option>
            </select>
          </Label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => submit(false)} disabled={busy || !canSubmit}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {initial ? 'Сохранить правки' : 'Сохранить расчёт'}
        </Button>
        {initial && (
          <Button variant="outline" onClick={() => submit(true)} disabled={busy || !canSubmit}>
            <Layers className="size-4" />
            Сохранить новой версией
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Отмена
        </Button>
        {!canSubmit && (
          <span className="text-xs text-muted-foreground">
            {!incoterm
              ? 'Выберите условие поставки — без него правила расчёта неизвестны'
              : 'В каждой строке кода нужны код ТН ВЭД, стоимость товара и вес нетто'}
          </span>
        )}
      </div>
    </div>
  )
}

