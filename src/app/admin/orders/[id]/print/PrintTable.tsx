import {
  CARGO_CONFIRMATION_TEXT,
  CLIENT_GUARANTEES_TEXT,
  fmtBool,
  fmtMoney,
  fmtNum,
  fmtRuDate,
  type PrintModel,
} from './data'
import { CustomsPrintBlock } from './CustomsPrintBlock'

// v0.5.0 (P1-22): разметка печатной формы заявки (28 пунктов бланка
// из S13) — выезд из page.tsx (резка под лимит 300, RULES 2.14).
// Server-компонент без клиентских хвостов: получает готовую модель
// (print/data.ts) и рисует лист А4. Тексты пунктов — 1:1.
export function PrintTable({ m }: { m: PrintModel }) {
  const hsCodeCell = [
    m.cargoName && (
      <span className="multi-line" key="n">
        {m.cargoName}
      </span>
    ),
    m.hsCodeText && (
      <span className="multi-line" key="h">
        ТН ВЭД: {m.hsCodeText}
      </span>
    ),
  ].filter(Boolean)

  const shipperCell = [
    m.shipperName && (
      <span className="multi-line" key="n">
        Наименование: {m.shipperName}
      </span>
    ),
    m.shipperInn && (
      <span className="multi-line" key="i">
        ИНН: {m.shipperInn}
      </span>
    ),
    m.shipperAddress && (
      <span className="multi-line" key="a">
        Адрес: {m.shipperAddress}
      </span>
    ),
  ].filter(Boolean)

  const consigneeCell = [
    m.consigneeName && (
      <span className="multi-line" key="n">
        Наименование: {m.consigneeName}
      </span>
    ),
    m.consigneeInn && (
      <span className="multi-line" key="i">
        ИНН: {m.consigneeInn}
      </span>
    ),
    m.consigneeAddress && (
      <span className="multi-line" key="a">
        Адрес: {m.consigneeAddress}
      </span>
    ),
  ].filter(Boolean)

  return (
    <div className="sheet">
      {/* ── Шапка ── */}
      <header className="doc-header">
        <div className="org-info">
          <b>Экспедитор:</b> {m.legalEntityName}
          {m.inn && (
            <span className="multi-line">
              ИНН: {m.inn}
              {m.kpp ? ` · КПП: ${m.kpp}` : ''}
            </span>
          )}
          {m.address && <span className="multi-line">Адрес: {m.address}</span>}
        </div>
        <div className="doc-title-block">
          <div className="doc-kind">
            Заявка на организацию транспортно-экспедиционных услуг
          </div>
          <div className="doc-meta">
            № {m.number} к договору № {m.contractNumber} от{' '}
            {m.contractSignedAt ? fmtRuDate(m.contractSignedAt) : '«___» __________ 20___ г.'}
          </div>
        </div>
        <div className="org-info" style={{ maxWidth: '40mm' }}>
          <b>Заказчик:</b> {m.customerName}
        </div>
      </header>

      {/* ── 28 пунктов бланка ── */}
      <table className="zayavka-table">
        <tbody>
          <tr>
            <td className="num">1</td>
            <th className="label">Дата заявки</th>
            <td>{fmtRuDate(m.createdAt)}</td>
          </tr>
          <tr>
            <td className="num">2</td>
            <th className="label">Клиент</th>
            <td>{m.customerName}</td>
          </tr>
          <tr>
            <td className="num">3</td>
            <th className="label">Тип перевозки</th>
            <td>{m.transportType}</td>
          </tr>
          <tr>
            <td className="num">4</td>
            <th className="label">Маршрут</th>
            <td>{m.route}</td>
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
            <td>{fmtNum(m.placesCount)}</td>
          </tr>
          <tr>
            <td className="num">7</td>
            <th className="label">Общий вес брутто груза, кг</th>
            <td>{fmtNum(m.weightKg)}</td>
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
            <td>{fmtNum(m.volumeM3)}</td>
          </tr>
          <tr>
            <td className="num">10</td>
            <th className="label">Тип упаковки</th>
            <td>{m.packaging}</td>
          </tr>
          <tr>
            <td className="num">11</td>
            <th className="label">Стоимость груза</th>
            <td>{m.cargoValue}</td>
          </tr>
          <tr>
            <td className="num">12</td>
            <th className="label">Наличие ОГ</th>
            <td>{fmtBool(m.dangerous)}</td>
          </tr>
          <tr>
            <td className="num">13</td>
            <th className="label">Возможность штабелировать</th>
            <td>{fmtBool(m.stackable)}</td>
          </tr>
          <tr>
            <td className="num">14</td>
            <th className="label">Возможность кантовать</th>
            <td>{fmtBool(m.tiltable)}</td>
          </tr>
          <tr>
            <td className="num">15</td>
            <th className="label">
              Особые требования по перевозке груза
            </th>
            <td>{m.specialRequirements}</td>
          </tr>
          <tr>
            <td className="num">16</td>
            <th className="label">Грузоотправитель, контакты</th>
            <td>{shipperCell.length > 0 ? shipperCell : ''}</td>
          </tr>
          <tr>
            <td className="num">17</td>
            <th className="label">Пункт отправления</th>
            <td>{m.originText}</td>
          </tr>
          <tr>
            <td className="num">18</td>
            <th className="label">
              Предварительная дата отправления
            </th>
            <td>{m.readyDateText}</td>
          </tr>
          <tr>
            <td className="num">19</td>
            <th className="label">Грузополучатель, контакты</th>
            <td>{consigneeCell.length > 0 ? consigneeCell : ''}</td>
          </tr>
          <tr>
            <td className="num">20</td>
            <th className="label">Пункт прибытия</th>
            <td>{m.destinationText}</td>
          </tr>
          <tr>
            <td className="num">21</td>
            <th className="label">Перечень услуг экспедитора</th>
            <td>{m.quoteDescription}</td>
          </tr>
          <tr>
            <td className="num">22</td>
            <th className="label">Срок доставки груза</th>
            <td>{m.quoteEta !== null ? `${m.quoteEta} дн.` : ''}</td>
          </tr>
          <tr>
            <td className="num">23</td>
            <th className="label">
              Стоимость перевозки и условия оплаты
            </th>
            <td>
              {m.quotePrice !== null ? (
                <>
                  {fmtMoney(m.quotePrice)}
                  {/* P1-04: валюта (формат formatMoney) и метка НДС —
                      та же цена, что в UI и БД (RULES 2.15) */}
                  {m.quoteCurrency !== 'RUB' && (
                    <span className="multi-line">Валюта цены: {m.quoteCurrency}. </span>
                  )}
                  {m.quoteVat && <span className="multi-line">{m.quoteVat}. </span>}
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
            <td>{CARGO_CONFIRMATION_TEXT}</td>
          </tr>
          <tr>
            <td className="num">26</td>
            <th className="label">Заверения об обстоятельствах</th>
            <td>{CLIENT_GUARANTEES_TEXT}</td>
          </tr>
          <tr>
            <td className="num">27</td>
            <th className="label">
              Ф.И.О. исполнителя Заявки от Клиента, тел., эл. почта
            </th>
            <td>
              {m.executorName && <span className="multi-line">ФИО: {m.executorName}</span>}
              {m.executorPhone && (
                <span className="multi-line">Тел. {m.executorPhone}</span>
              )}
              {m.executorEmail && (
                <span className="multi-line">Email: {m.executorEmail}</span>
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
          <b>Заказчик:</b> {m.customerName}
          <div className="sign-line">подпись / печать</div>
        </div>
        <div className="sign-block">
          <b>Экспедитор:</b> {m.legalEntityName}
          <div className="sign-line">подпись / печать</div>
        </div>
      </div>

      {/* ── DF-19: приложение с расчётом таможенных платежей —
          печатается только при сохранённом расчёте заявки; подпись
          «Оценка…» внутри блока (D41) ── */}
      {m.customs && <CustomsPrintBlock d={m.customs} />}

      <footer className="doc-footer">
        Документ сформирован автоматически в Logix · заявка №{' '}
        {m.number} · договор № {m.contractNumber}
      </footer>
    </div>
  )
}
