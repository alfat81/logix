import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { formatMoney, isCurrencyCode, isVatMode, VAT_MODE_LABELS } from '@/lib/money'
import { getEmployeeByToken, SESSION_COOKIE } from '@/lib/auth'
import { TRANSPORT_TYPE_LABELS, joinRouteText } from '@/lib/route-fields'
import { readLeadCargo } from '@/lib/leads'
import { requisitesInn } from '@/lib/requisite-fields'
import { OrderPrintToolbar } from '@/components/admin/OrderPrintToolbar'
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

export const dynamic = 'force-dynamic'

type QuoteSnapshotData = {
  description?: string
  transportModes?: string[]
  // P1-04: цена с валютой/НДС; priceEstimate — легаси-ключ снимков
  // до миграции (рубли) — читается как RUB-фолбэк
  price?: number | string
  currency?: string
  vatMode?: string
  priceEstimate?: number
  etaDays?: number
}

function fmtRuDate(d: Date | null | undefined): string {
  if (!d) return ''
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getUTCFullYear()}`
}

function fmtMoney(n: number): string {
  return formatMoney(n, 'RUB')
}

function fmtNum(v: unknown): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return ''
  // «19.5» → «19,5» — бланк оперирует запятой
  return String(v).replace('.', ',')
}

function fmtBool(v: unknown): string {
  if (v === true) return 'Да'
  if (v === false) return 'Нет'
  return ''
}

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

  const cargo = readLeadCargo(order.cargoInfo)

  const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

  // Снимок условий сделки (Ж1): толерантный разбор — поля опциональны
  const q = (order.quoteSnapshot ?? {}) as QuoteSnapshotData
  const quoteDescription = typeof q.description === 'string' ? q.description : ''
  // P1-04: цена — новый ключ price (число/строка Decimal) либо легаси
  // priceEstimate (рубли до миграции); валюта/НДС — с дефолтами
  const rawPrice = q.price ?? q.priceEstimate
  const quotePrice =
    typeof rawPrice === 'string'
      ? Number.isFinite(Number(rawPrice))
        ? Number(rawPrice)
        : null
      : typeof rawPrice === 'number'
        ? rawPrice
        : null
  const quoteCurrency = isCurrencyCode(q.currency) ? q.currency : 'RUB'
  const quoteVat = isVatMode(q.vatMode) ? VAT_MODE_LABELS[q.vatMode] : ''
  const quoteEta = typeof q.etaDays === 'number' ? q.etaDays : null
  const quoteModes = Array.isArray(q.transportModes)
    ? q.transportModes.filter((m): m is string => typeof m === 'string')
    : []

  // P1-03: тип/маршрут — из колонок заявки; легаси-ключи Json — fallback
  // (данные до миграции), последний fallback — виды транспорта варианта
  const transportLabel =
    typeof order.transportType === 'string' &&
    order.transportType in TRANSPORT_TYPE_LABELS
      ? TRANSPORT_TYPE_LABELS[order.transportType as keyof typeof TRANSPORT_TYPE_LABELS]
      : ''
  const originText = joinRouteText(order.originCountry, order.originCity) || s(cargo.from)
  const destinationText =
    joinRouteText(order.destinationCountry, order.destinationCity) || s(cargo.to)

  // Тип перевозки: из колонок (бланк п.3) либо из видов транспорта варианта
  const transportType =
    transportLabel || s(cargo.transportType) || (quoteModes.length > 0 ? quoteModes.join(', ') : '')

  // Маршрут: подробная строка бланка либо «откуда — куда» из колонок
  const route =
    s(cargo.routeNote) || [originText, destinationText].filter(Boolean).join(' — ')

  // Готовность к отгрузке (п.18): колонка readyDate → дд.мм.гггг
  const readyDateText = order.readyDate
    ? (order.readyDate instanceof Date
        ? order.readyDate.toLocaleDateString('ru-RU')
        : String(order.readyDate).slice(0, 10))
    : s(cargo.shipDate)

  // Исполнитель заявки от клиента (п.27): контакт из анкеты лида,
  // fallback — контакты клиента из справочника
  const raw = (order.lead?.rawContact ?? null) as Record<string, unknown> | null
  const executorName = raw && typeof raw.name === 'string' ? raw.name : ''
  const executorPhone =
    raw && typeof raw.phone === 'string' ? raw.phone : (order.customer.phone ?? '')
  const executorEmail =
    raw && typeof raw.email === 'string' ? raw.email : (order.customer.email ?? '')

  // Реквизиты экспедитора: известные ключи по меткам формы Ж6б
  const req = (order.legalEntity.requisites ?? {}) as Record<string, unknown>
  const reqLine = (key: string): string => {
    const v = req[key]
    return typeof v === 'string' && v.trim() ? v.trim() : ''
  }
  const inn = requisitesInn(order.legalEntity.requisites)
  const kpp = reqLine('kpp')
  const address = reqLine('address')

  const hsCodeCell = [s(cargo.cargoName), s(cargo.hsCode) || s(order.hsCode)]
    .filter(Boolean)
    .map((v, i) => (
      <span className="multi-line" key={i}>
        {i === 1 ? `ТН ВЭД: ${v}` : v}
      </span>
    ))

  const shipperCell = [
    s(cargo.shipperName) && (
      <span className="multi-line" key="n">
        Наименование: {s(cargo.shipperName)}
      </span>
    ),
    s(cargo.shipperInn) && (
      <span className="multi-line" key="i">
        ИНН: {s(cargo.shipperInn)}
      </span>
    ),
    s(cargo.shipperAddress) && (
      <span className="multi-line" key="a">
        Адрес: {s(cargo.shipperAddress)}
      </span>
    ),
  ].filter(Boolean)

  const consigneeCell = [
    s(cargo.consigneeName) && (
      <span className="multi-line" key="n">
        Наименование: {s(cargo.consigneeName)}
      </span>
    ),
    s(cargo.consigneeInn) && (
      <span className="multi-line" key="i">
        ИНН: {s(cargo.consigneeInn)}
      </span>
    ),
    s(cargo.consigneeAddress) && (
      <span className="multi-line" key="a">
        Адрес: {s(cargo.consigneeAddress)}
      </span>
    ),
  ].filter(Boolean)

  return (
    <>
      <div className="print-root">
        <OrderPrintToolbar label={`Заявка № ${order.number}`} />

        <div className="sheet">
          {/* ── Шапка ── */}
          <header className="doc-header">
            <div className="org-info">
              <b>Экспедитор:</b> {order.legalEntity.name}
              {inn && (
                <span className="multi-line">
                  ИНН: {inn}
                  {kpp ? ` · КПП: ${kpp}` : ''}
                </span>
              )}
              {address && <span className="multi-line">Адрес: {address}</span>}
            </div>
            <div className="doc-title-block">
              <div className="doc-kind">
                Заявка на организацию транспортно-экспедиционных услуг
              </div>
              <div className="doc-meta">
                № {order.number} к договору № {order.contract.number} от{' '}
                {order.contract.signedAt
                  ? fmtRuDate(order.contract.signedAt)
                  : '«___» __________ 20___ г.'}
              </div>
            </div>
            <div className="org-info" style={{ maxWidth: '40mm' }}>
              <b>Заказчик:</b> {order.customer.name}
            </div>
          </header>

          {/* ── 28 пунктов бланка ── */}
          <table className="zayavka-table">
            <tbody>
              <tr>
                <td className="num">1</td>
                <th className="label">Дата заявки</th>
                <td>{fmtRuDate(order.createdAt)}</td>
              </tr>
              <tr>
                <td className="num">2</td>
                <th className="label">Клиент</th>
                <td>{order.customer.name}</td>
              </tr>
              <tr>
                <td className="num">3</td>
                <th className="label">Тип перевозки</th>
                <td>{transportType}</td>
              </tr>
              <tr>
                <td className="num">4</td>
                <th className="label">Маршрут</th>
                <td>{route}</td>
              </tr>
              <tr>
                <td className="num">5</td>
                <th className="label">
                  Наименование груза, код ТН ВЭД
                </th>
                <td>{hsCodeCell.length > 0 ? hsCodeCell : ''}</td>
              </tr>
              <tr>
                <td className="num">6</td>
                <th className="label">Количество мест</th>
                <td>{fmtNum(cargo.placesCount)}</td>
              </tr>
              <tr>
                <td className="num">7</td>
                <th className="label">Общий вес брутто груза, кг</th>
                <td>{fmtNum(cargo.weightKg)}</td>
              </tr>
              <tr>
                <td className="num">8</td>
                <th className="label">
                  Размеры и вес каждого места (метры / кг)
                </th>
                <td></td>
              </tr>
              <tr>
                <td className="num">9</td>
                <th className="label">Общий объём груза, м³</th>
                <td>{fmtNum(cargo.volumeM3)}</td>
              </tr>
              <tr>
                <td className="num">10</td>
                <th className="label">Тип упаковки</th>
                <td>{s(cargo.packaging)}</td>
              </tr>
              <tr>
                <td className="num">11</td>
                <th className="label">Стоимость груза</th>
                <td>{s(cargo.cargoValue)}</td>
              </tr>
              <tr>
                <td className="num">12</td>
                <th className="label">Наличие ОГ</th>
                <td>{fmtBool(cargo.dangerous)}</td>
              </tr>
              <tr>
                <td className="num">13</td>
                <th className="label">Возможность штабелировать</th>
                <td>{fmtBool(cargo.stackable)}</td>
              </tr>
              <tr>
                <td className="num">14</td>
                <th className="label">Возможность кантовать</th>
                <td>{fmtBool(cargo.tiltable)}</td>
              </tr>
              <tr>
                <td className="num">15</td>
                <th className="label">
                  Особые требования по перевозке груза
                </th>
                <td>{s(cargo.specialRequirements)}</td>
              </tr>
              <tr>
                <td className="num">16</td>
                <th className="label">Грузоотправитель, контакты</th>
                <td>{shipperCell.length > 0 ? shipperCell : ''}</td>
              </tr>
              <tr>
                <td className="num">17</td>
                <th className="label">Пункт отправления</th>
                <td>{originText}</td>
              </tr>
              <tr>
                <td className="num">18</td>
                <th className="label">
                  Предварительная дата отправления
                </th>
                <td>{readyDateText}</td>
              </tr>
              <tr>
                <td className="num">19</td>
                <th className="label">Грузополучатель, контакты</th>
                <td>{consigneeCell.length > 0 ? consigneeCell : ''}</td>
              </tr>
              <tr>
                <td className="num">20</td>
                <th className="label">Пункт прибытия</th>
                <td>{destinationText}</td>
              </tr>
              <tr>
                <td className="num">21</td>
                <th className="label">Перечень услуг экспедитора</th>
                <td>{quoteDescription}</td>
              </tr>
              <tr>
                <td className="num">22</td>
                <th className="label">Срок доставки груза</th>
                <td>{quoteEta !== null ? `${quoteEta} дн.` : ''}</td>
              </tr>
              <tr>
                <td className="num">23</td>
                <th className="label">
                  Стоимость перевозки и условия оплаты
                </th>
                <td>
                  {quotePrice !== null ? (
                    <>
                      {fmtMoney(quotePrice)}
                      {/* P1-04: валюта (формат formatMoney) и метка НДС —
                          та же цена, что в UI и БД (RULES 2.15) */}
                      {quoteCurrency !== 'RUB' && (
                        <span className="multi-line">Валюта цены: {quoteCurrency}. </span>
                      )}
                      {quoteVat && <span className="multi-line">{quoteVat}. </span>}
                      <span className="multi-line">Условия оплаты: </span>
                    </>
                  ) : (
                    ''
                  )}
                </td>
              </tr>
              <tr>
                <td className="num">24</td>
                <th className="label">Особые условия</th>
                <td></td>
              </tr>
              <tr>
                <td className="num">25</td>
                <th className="label">Подтверждение о грузе</th>
                <td>
                  Заказчик подтверждает, что груз не содержит веществ и
                  предметов, запрещенных к перевозке авиационным,
                  автомобильным, железнодорожным и морским транспортом. Об
                  ответственности за неточные и неполные сведения о грузе
                  предупреждены.
                </td>
              </tr>
              <tr>
                <td className="num">26</td>
                <th className="label">Заверения об обстоятельствах</th>
                <td>
                  Клиент гарантирует и подтверждает: достоверность и полноту
                  сведений о грузе, массе, объеме, габаритах и свойствах
                  груза, в том числе о ПВИО; груз не является товаром, в
                  отношении которого введены запреты на импорт/экспорт в
                  соответствии с ограничениями, установленными
                  законодательством РФ, действующими на момент перевозки;
                  имеет все необходимые разрешения, лицензии, сертификаты
                  для перевозки данного груза и предоставит их Экспедитору.
                  Направляя настоящую заявку, Клиент уведомлен об
                  ответственности за непредоставление информации о ПВИО
                  согласно ст. 11.14.3 КоАП РФ. При нарушении указанных
                  гарантий Клиент несет полную ответственность, включая
                  возмещение Экспедитору всех убытков.
                </td>
              </tr>
              <tr>
                <td className="num">27</td>
                <th className="label">
                  Ф.И.О. исполнителя Заявки от Клиента, тел., эл. почта
                </th>
                <td>
                  {executorName && <span className="multi-line">ФИО: {executorName}</span>}
                  {executorPhone && (
                    <span className="multi-line">Тел. {executorPhone}</span>
                  )}
                  {executorEmail && (
                    <span className="multi-line">Email: {executorEmail}</span>
                  )}
                </td>
              </tr>
              <tr>
                <td className="num">28</td>
                <th className="label">Подпись, печать Клиента</th>
                <td className="empty-line"></td>
              </tr>
            </tbody>
          </table>

          {/* ── Подписи сторон ── */}
          <div className="signatures">
            <div className="sign-block">
              <b>Заказчик:</b> {order.customer.name}
              <div className="sign-line">подпись / печать</div>
            </div>
            <div className="sign-block">
              <b>Экспедитор:</b> {order.legalEntity.name}
              <div className="sign-line">подпись / печать</div>
            </div>
          </div>

          <footer className="doc-footer">
            Документ сформирован автоматически в Logix · заявка №{' '}
            {order.number} · договор № {order.contract.number}
          </footer>
        </div>
      </div>
    </>
  )
}
