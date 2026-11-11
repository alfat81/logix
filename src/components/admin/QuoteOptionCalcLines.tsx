'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ReferenceCombobox, type RefPick } from '@/components/references/ReferenceCombobox'
import {
  OPTION_CALC_ARTICLES,
  OPTION_CALC_ARTICLE_LABELS,
  type OptionCalcArticle,
} from '@/lib/option-calc'
import { formatMoney } from '@/lib/money'

// ─── DF-27 волна 1: строки транспортного расчёта варианта (блок 4) ──
// Статья, наименование, сумма, валюта, курс к валюте предложения,
// комментарий. Сумма в валюте предложения и итог считает сервер;
// здесь — итог из ответа (calcTotals) и маржа (сотрудникам, D3).

export type CalcLineForm = {
  key: string
  article: OptionCalcArticle
  title: string
  amount: string
  currency: string
  fxRate: string
  comment: string
}

export const EMPTY_CALC_LINE = (): CalcLineForm => ({
  key: Math.random().toString(36).slice(2),
  article: 'freight',
  title: '',
  amount: '',
  currency: 'RUB',
  fxRate: '',
  comment: '',
})

export function QuoteOptionCalcLines({
  lines,
  onChange,
  offerCurrency,
  totals,
}: {
  lines: CalcLineForm[]
  onChange: (lines: CalcLineForm[]) => void
  offerCurrency: string
  totals: { total: number } | null
}) {
  const patch = (i: number, p: Partial<CalcLineForm>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...p } : l)))
  return (
    <div className="grid gap-2">
      <Label>Строки расчёта (статьи стоимости перевозки)</Label>
      {lines.length === 0 && (
        <span className="text-xs text-muted-foreground">
          Строк нет — расчёт можно вести без разбивки по статьям
        </span>
      )}
      {lines.map((l, i) => (
        <div key={l.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Статья</span>
              <Select
                value={l.article}
                onValueChange={(v) => patch(i, { article: v as OptionCalcArticle })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPTION_CALC_ARTICLES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {OPTION_CALC_ARTICLE_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Наименование</span>
              <Input
                className="h-9"
                placeholder="не обязательно"
                value={l.title}
                onChange={(e) => patch(i, { title: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Сумма</span>
              <Input
                className="h-9"
                inputMode="decimal"
                value={l.amount}
                onChange={(e) => patch(i, { amount: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Валюта</span>
              <ReferenceCombobox
                dir="currency"
                value={l.currency}
                onPick={(pick: RefPick) =>
                  patch(i, { currency: pick && pick.code ? pick.code : 'RUB' })
                }
                placeholder="Рубли"
              />
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Курс к {offerCurrency}</span>
              <Input
                className="h-9"
                inputMode="decimal"
                placeholder="если валюта ≠ цены"
                value={l.fxRate}
                onChange={(e) => patch(i, { fxRate: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Комментарий</span>
              <Input
                className="h-9"
                value={l.comment}
                onChange={(e) => patch(i, { comment: e.target.value })}
              />
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:text-destructive"
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
            aria-label="Удалить строку расчёта"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...lines, EMPTY_CALC_LINE()])}
        >
          + Строка расчёта
        </Button>
        {totals && (
          <span className="text-sm font-medium tabular-nums">
            Итого по строкам: {formatMoney(totals.total, offerCurrency)}
          </span>
        )}
      </div>
    </div>
  )
}
