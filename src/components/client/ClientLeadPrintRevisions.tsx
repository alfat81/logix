'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PrintRevisionList } from '@/components/print-revisions/PrintRevisionList'

// ─── DF-27 волна 2 (Р-3, D75): печатные редакции заявки (кабинет) ──
// Клиент подтверждает АКТУАЛЬНУЮ редакцию состава сведений (ту же, что
// подтверждает менеджер). Подтверждение — согласие с СОСТАВОМ сведений
// на дату, предварительная оценка цены окончательным обязательством не
// становится. Список и подтверждения — PrintRevisionList (общий с
// админкой); создание редакций — действие менеджера.

export function ClientLeadPrintRevisions({ leadId, onChanged }: { leadId: string; onChanged?: () => void }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Редакции заявки</CardTitle>
      </CardHeader>
      <CardContent>
        <PrintRevisionList
          role="client"
          leadId={leadId}
          onChanged={onChanged}
          confirmLabel="Подтвердить редакцию"
          note="Подтверждение означает согласие с составом сведений заявки на эту дату; расчёт остаётся предварительным до согласования варианта."
        />
      </CardContent>
    </Card>
  )
}
