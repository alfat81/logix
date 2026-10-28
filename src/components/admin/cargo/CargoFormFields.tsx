'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TRANSPORT_TYPES, type LeadCargoForm } from '@/lib/leads'
import { ReferenceCombobox, type RefPick } from '@/components/references/ReferenceCombobox'
import { IncotermPicker } from '@/components/references/IncotermPicker'

// ─── Форма: поля бланка (значения — строки, см. LeadCargoForm) ─────
// v0.5.0 (P1-22): выезд из CargoGroups.tsx (резка под лимит 300,
// RULES 2.14).
// Используется диалогом создания лида (В5) и правкой груза заявки (Ж1):
// один бланк — одно место правки. onChange получает СЛЕДУЮЩЕЕ
// состояние целиком (компонент неконтролируемо ничего не хранит).
// DF-17: страна и упаковка — Combobox справочника (IC-16); условие
// поставки с разъяснением — опционально (showIncoterm, форма запроса
// клиента); «Другое…» — свободный текст упаковки (код пустой).
export function CargoFormFields({
  form,
  onChange,
  showIncoterm = false,
}: {
  form: LeadCargoForm
  onChange: (next: LeadCargoForm) => void
  // DF-17: условие поставки — в форме запроса клиента; у менеджера
  // Инкотермс спрашивается при конвертации (LeadConvertBlock)
  showIncoterm?: boolean
}) {
  const set = (key: keyof LeadCargoForm, value: string) =>
    onChange({ ...form, [key]: value })

  // Значения Select'ов: 'none' = «не указано» → пустая строка,
  // поле не попадает в cargoInfo (buildLeadPayload пропускает пустые).
  const setSelected = (key: keyof LeadCargoForm, value: string) =>
    set(key, value === 'none' ? '' : value)

  // Страна: код в форму, имя денормализует сервер из справочника
  const setCountry = (key: 'originCountryCode' | 'destinationCountryCode') => (pick: RefPick) =>
    set(key, pick && pick.code ? pick.code : '')

  // Упаковка: из справочника → текст = имя, код = код; «Другое» → текст
  // как есть, код пустой; очистка → пусто.
  const setPackaging = (pick: RefPick) => {
    if (pick === null) {
      onChange({ ...form, packaging: '', packagingCode: '' })
    } else if (pick.code === null) {
      onChange({ ...form, packaging: pick.text, packagingCode: '' })
    } else {
      onChange({ ...form, packaging: pick.name, packagingCode: pick.code })
    }
  }

  const setIncoterm = (pick: RefPick) => set('incotermCode', pick && pick.code ? pick.code : '')

  return (
    <div className="grid gap-5">
      {/* ── Маршрут (бланк: тип перевозки, пункты, дата) ── */}
      <div className="grid gap-2">
        <div className="text-sm font-medium">Маршрут</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Тип перевозки</Label>
            <Select value={form.transportType} onValueChange={(v) => setSelected('transportType', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Не выбран" />
              </SelectTrigger>
              <SelectContent>
                {TRANSPORT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Предв. дата отправления</Label>
            <Input
              type="date"
              value={form.shipDate}
              onChange={(e) => set('shipDate', e.target.value)}
            />
          </div>
          {/* DF-17: страна — из справочника (Combobox, IC-16); город — текст */}
          <ReferenceCombobox
            dir="country"
            value={form.originCountryCode}
            onPick={setCountry('originCountryCode')}
            label="Страна отправления"
            placeholder="Например: Китай"
            allowClear
          />
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Пункт отправления</Label>
            <Input
              placeholder="Город или пункт, например: Чэнду"
              value={form.originCity}
              onChange={(e) => set('originCity', e.target.value)}
            />
          </div>
          <ReferenceCombobox
            dir="country"
            value={form.destinationCountryCode}
            onPick={setCountry('destinationCountryCode')}
            label="Страна прибытия"
            placeholder="Например: Россия"
            allowClear
          />
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Пункт прибытия</Label>
            <Input
              placeholder="Город или пункт, например: а/п Шереметьево"
              value={form.destinationCity}
              onChange={(e) => set('destinationCity', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5 col-span-2">
            <Label className="text-xs text-muted-foreground">Маршрут (подробно)</Label>
            <Input
              placeholder="Полный маршрут с промежуточными пунктами — не обязательно"
              value={form.routeNote}
              onChange={(e) => set('routeNote', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Груз (бланк: наименование … особые требования) ── */}
      <div className="grid gap-2">
        <div className="text-sm font-medium">Груз</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5 col-span-2">
            <Label className="text-xs text-muted-foreground">Наименование груза</Label>
            <Input
              placeholder="Например: Клапан, цилиндр"
              value={form.cargoName}
              onChange={(e) => set('cargoName', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Код ТН ВЭД</Label>
            <Input
              placeholder="Например, 8479 — не обязательно"
              value={form.hsCode}
              onChange={(e) => set('hsCode', e.target.value)}
            />
          </div>
          {/* DF-17: упаковка — Combobox с вариантом «Другое…» (IC-16) */}
          <ReferenceCombobox
            dir="packaging"
            value={form.packagingCode || form.packaging}
            onPick={setPackaging}
            label="Тип упаковки"
            placeholder="Например: Коробка"
            allowClear
            allowOther
          />
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Количество мест</Label>
            <Input
              inputMode="numeric"
              placeholder="2"
              value={form.placesCount}
              onChange={(e) => set('placesCount', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Общий вес брутто, кг</Label>
            <Input
              inputMode="decimal"
              placeholder="19,5"
              value={form.weightKg}
              onChange={(e) => set('weightKg', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Общий объём, м³</Label>
            <Input
              inputMode="decimal"
              placeholder="0,8"
              value={form.volumeM3}
              onChange={(e) => set('volumeM3', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Стоимость груза</Label>
            <Input
              placeholder="Например: 500 000 руб. — не обязательно"
              value={form.cargoValue}
              onChange={(e) => set('cargoValue', e.target.value)}
            />
          </div>
          {showIncoterm && (
            <div className="col-span-2">
              <IncotermPicker value={form.incotermCode} onPick={setIncoterm} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-3 col-span-2">
            {(
              [
                ['dangerous', 'Опасный груз'],
                ['stackable', 'Штабелирование'],
                ['tiltable', 'Кантование'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Select value={form[key]} onValueChange={(v) => setSelected(key, v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* 'none' = «не указано»: buildLeadPayload такое
                        значение не включает в cargoInfo */}
                    <SelectItem value="none">—</SelectItem>
                    <SelectItem value="yes">Да</SelectItem>
                    <SelectItem value="no">Нет</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="grid gap-1.5 col-span-2">
            <Label className="text-xs text-muted-foreground">Особые требования</Label>
            <Textarea
              rows={2}
              placeholder="Температурный режим, хрупкое, документы и т.п. — не обязательно"
              value={form.specialRequirements}
              onChange={(e) => set('specialRequirements', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Стороны: грузоотправитель и грузополучатель ── */}
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ['Грузоотправитель', 'shipper'],
            ['Грузополучатель', 'consignee'],
          ] as const
        ).map(([title, side]) => (
          <div key={side} className="grid gap-2 content-start">
            <div className="text-sm font-medium">{title}</div>
            <Input
              placeholder="Наименование"
              value={form[`${side}Name` as keyof LeadCargoForm] as string}
              onChange={(e) => set(`${side}Name` as keyof LeadCargoForm, e.target.value)}
            />
            <Input
              placeholder="ИНН — не обязательно"
              value={form[`${side}Inn` as keyof LeadCargoForm] as string}
              onChange={(e) => set(`${side}Inn` as keyof LeadCargoForm, e.target.value)}
            />
            <Input
              placeholder="Адрес — не обязательно"
              value={form[`${side}Address` as keyof LeadCargoForm] as string}
              onChange={(e) => set(`${side}Address` as keyof LeadCargoForm, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
