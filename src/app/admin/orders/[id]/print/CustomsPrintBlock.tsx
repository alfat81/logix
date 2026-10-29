import { CUSTOMS_EVALUATION_NOTE } from '@/lib/customs'
import type { PrintCustoms } from './customs-data'

// ─── DF-19: печатное приложение «Расчёт таможенных платежей (оценка)» ──
// Server-компонент (как PrintTable): лист после подписей сторон,
// перед колонтитулом. Чёрный + брендовые токены через var() (print.css,
// RULES 2.14 — новых hex нет). Подпись «Оценка…» обязательна (D41).

export function CustomsPrintBlock({ d }: { d: PrintCustoms }) {
  return (
    <section className="customs-block">
      <h2 className="customs-title">
        Приложение к заявке: расчёт таможенных платежей (оценка)
      </h2>
      <div className="customs-meta">
        Условие поставки: {d.incotermText || '—'} · дата расчёта {d.calcDateText} · курс ЦБ от {d.fxDateText}
        {d.fxText !== '—' ? ` (${d.fxText})` : ''}
      </div>
      <table className="customs-table">
        <thead>
          <tr>
            <th>Код ТН ВЭД</th>
            <th>Таможенная стоимость, ₽</th>
            <th>Пошлина, ₽</th>
            <th>Доп. пошлина, ₽</th>
            <th>НДС, ₽</th>
          </tr>
        </thead>
        <tbody>
          {d.items.map((it) => (
            <tr key={it.hsCode}>
              <td className="mono">{it.hsCode}</td>
              <td className="num">{it.customsValue}</td>
              <td className="num">{it.duty}</td>
              <td className="num">{it.addDuty || '—'}</td>
              <td className="num">{it.vat}</td>
            </tr>
          ))}
          <tr className="totals">
            <td>Итого</td>
            <td className="num">{d.customsValueTotal}</td>
            <td className="num">{d.dutyTotal}</td>
            <td className="num">{d.addDutyTotal || '—'}</td>
            <td className="num">{d.vatTotal}</td>
          </tr>
        </tbody>
      </table>
      <div className="customs-totals">
        {d.feeText && (
          <div>
            Таможенный сбор: <b>{d.feeText}</b>
          </div>
        )}
        <div>
          Всего таможенные платежи: <b>{d.paymentsTotal}</b>
        </div>
        {d.brokerFeeText && (
          <div>
            Вознаграждение брокера за ДТ (вне платежей государству): <b>{d.brokerFeeText}</b>
          </div>
        )}
        {d.grandTotalText && (
          <div>
            Итого к оплате: <b>{d.grandTotalText}</b>
          </div>
        )}
      </div>
      <div className="customs-note">{CUSTOMS_EVALUATION_NOTE}.</div>
    </section>
  )
}
