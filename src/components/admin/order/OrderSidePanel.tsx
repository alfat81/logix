'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ListTabs } from '@/components/admin/ListTabs'
import { NoteForm } from '@/components/admin/NoteForm'
import { ActivityFeed, type ActivityRow } from '@/components/admin/ActivityFeed'
import { DocumentsSection } from '@/components/documents/DocumentsSection'
import { CustomsCalcScreen } from '@/components/admin/customs/CustomsCalcScreen'
import type { EstimatePrefill } from '@/components/admin/customs/types'
import type { OrderStatus } from '@/lib/order-constants'

// ─── DF-21: правая панель заявки — вкладки «События | Документы | Расчёт» ──
// По макету экрана «Заявки» (UXPILOT-BRIEF §3.1): заголовок с номером
// заявки, совпадающим с карточкой/шапкой страницы (номер приходит тем же
// пропсом из одного GET — рассинхрон невозможен); чата и «AI Assistant»
// нет. Вкладка «Расчёт» — после DF-19 (выполнен), у отменённой заявки
// скрыта; «Документы» показывает существующий документооборот (статусы
// документов DF-12 и разрешительные DF-16 добавятся со своими карточками —
// заглушек с выдуманными данными нет).
//
// Внутри панели — существующие компоненты без копий (IC-14): лента
// ActivityFeed с метками видимости (showVisibility — сотрудникам),
// форма заметки NoteForm с переключателем «внутренняя / видна клиенту»,
// DocumentsSection и CustomsCalcScreen в компактном режиме 320px.

type PanelTab = 'events' | 'documents' | 'calc'

export function OrderSidePanel({
  orderNumber,
  orderId,
  status,
  activities,
  estimates,
  initialIncoterm,
  initialPlace,
  onChanged,
}: {
  orderNumber: string
  orderId: string
  status: OrderStatus
  activities: ActivityRow[]
  estimates: EstimatePrefill[]
  initialIncoterm?: string | null
  initialPlace?: string | null
  onChanged: () => void
}) {
  const [tab, setTab] = useState<PanelTab>('events')

  // DF-19 закрыт — вкладка «Расчёт» видна; у отменённой сделки секция
  // расчёта не показывалась и раньше — вкладка скрыта целиком.
  const tabs: Array<{ key: PanelTab; label: string }> = [
    { key: 'events', label: 'События' },
    { key: 'documents', label: 'Документы' },
    ...(status === 'cancelled' ? [] : [{ key: 'calc' as const, label: 'Расчёт' }]),
  ]
  const activeTab: PanelTab = tabs.some((t) => t.key === tab) ? tab : 'events'

  return (
    <Card className="p-4 grid gap-3">
      {/* Заголовок панели: номер совпадает с карточкой (один источник —
          order.number из GET /api/admin/orders/[id]) */}
      <div className="flex items-center gap-2">
        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="text-base font-semibold leading-tight min-w-0 truncate">
          Заявка № {orderNumber}
        </h2>
      </div>

      {/* Вкладки панели; на телефоне липкие под шапкой (§4.5) — переключение
          доступно на любой прокрутке «листа деталей» */}
      <div className="sticky top-14 z-20 -mx-4 px-4 pb-1 bg-card border-b">
        <ListTabs
          tabs={tabs}
          active={activeTab}
          onChange={(k) => setTab(k as PanelTab)}
        />
      </div>

      {activeTab === 'events' && (
        <div className="grid gap-3">
          {/* Ж3: заметка — внутренняя или видная клиенту (переключатель
              внутри формы, DF-21); пишется в общий журнал */}
          <NoteForm targetType="order" targetId={orderId} onAdded={onChanged} />
          {/* Ж2: лента DealEvent (DF-01) — человек и компания собираются
              при чтении (DF-02A), у каждой записи метка видимости */}
          <ActivityFeed
            activities={activities}
            showVisibility
            emptyText="Событий пока нет — журнал начнётся с первого действия"
          />
        </div>
      )}

      {activeTab === 'documents' && (
        <DocumentsSection
          documentsUrl={`/api/admin/orders/${orderId}/documents`}
          versionsUrlFor={(docId) => `/api/admin/documents/${docId}/versions`}
          deleteUrlFor={(docId) => `/api/admin/documents/${docId}`}
          canMarkInternal
          emptyText="Документов нет — товаросопроводительные и таможенные бумаги живут здесь, без почты"
        />
      )}

      {activeTab === 'calc' && (
        <CustomsCalcScreen
          targetType="order"
          targetId={orderId}
          estimates={estimates}
          initialIncoterm={initialIncoterm}
          initialPlace={initialPlace}
          compact
          onChanged={onChanged}
        />
      )}
    </Card>
  )
}
