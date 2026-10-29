import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { getEmployeeByToken, SESSION_COOKIE } from '@/lib/auth'
import { OrderPrintToolbar } from '@/components/admin/OrderPrintToolbar'
import { buildPrintModel } from './data'
import { buildPrintCustoms } from './customs-data'
import { PrintTable } from './PrintTable'
import './print.css'

// ─── Печатная форма заявки (Е) — приложение к договору ────────────
// По реальному бланку из S13 (zayavka-J-3-26-2634.pdf, 28 пунктов):
// заявка — неотъемлемое приложение к рамочному договору (роадмап 4),
// формируется автоматически из данных сделки. Менеджер печатает и
// отдаёт клиенту на подпись; в кабинет клиента форма НЕ отдаётся —
// в ней цена (решение №1: цены клиенту в кабинете не показываются,
// печатная форма — офлайн-документ вручную).
//
// Страница вне группы (dashboard): без бокового меню и шапки — чистый
// лист А4 (print.css), собственная проверка сессии сотрудника.
//
// v0.5.0 (P1-22): модель (data.ts) и разметка бланка (PrintTable.tsx)
// выезды из page.tsx (резка под лимит 300, RULES 2.14).

export const dynamic = 'force-dynamic'

export default async function OrderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const employee = await getEmployeeByToken(
    (await cookies()).get(SESSION_COOKIE)?.value
  )
  if (!employee) {
    redirect('/admin/login')
  }

  const { id } = await params
  const order = await db.order.findUnique({
    where: { id },
    include: {
      contract: { select: { number: true, signedAt: true } },
      legalEntity: { select: { name: true, requisites: true } },
      customer: { select: { name: true, phone: true, email: true } },
      lead: { select: { rawContact: true } },
    },
  })
  if (!order) {
    notFound()
  }

  const model = buildPrintModel(order)

  // DF-19: приложение с расчётом таможенных платежей — текущая версия
  // расчёта заявки; нет расчёта — раздела нет (не рисуем заглушек)
  const calc = await db.customsCalculation.findFirst({
    where: { orderId: id, isCurrent: true },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
  if (calc) {
    model.customs = buildPrintCustoms({
      incoterm: calc.incoterm,
      incotermPlace: calc.incotermPlace,
      calcDate: calc.calcDate,
      fxDate: calc.fxDate,
      fxRates: calc.fxRates,
      fxReservePercent: calc.fxReservePercent,
      totals: calc.totals,
      items: calc.items.map((it) => ({
        hsCode: it.hsCode,
        customsValue: String(it.customsValue),
        duty: String(it.duty),
        addDuty: String(it.addDuty),
        vat: String(it.vat),
        allocatedCosts: String(it.allocatedCosts),
      })),
    })
  }

  return (
    <>
      <div className="print-root">
        <OrderPrintToolbar label={`Заявка № ${order.number}`} />
        <PrintTable m={model} />
      </div>
    </>
  )
}
