'use client'

import { DocumentsRegistrySection } from '@/components/documents/DocumentsRegistrySection'
import type { StageRow } from '@/components/admin/order/types'

// ─── DF-26 §3.3: режим реестра основной области страницы заявки ─────
// Выезд из page.tsx (RULES 2.14): сборка админских URL реестра.
// Разрешительные — строки требований в анатомии реестра (§3.3.3):
// добавление строк и загрузка файлов — единая форма (T21-02), правка/
// «не требуется» — сотрудник; «внутренние» — сотруднику. Смена этапа
// строки — PATCH /api/admin/documents/[id] (AUD-11); «На проверку» —
// PATCH …/status (draft → in_review).

export function OrderRegistryMode({
  orderId,
  transportType,
  stages,
  onBack,
  onChanged,
}: {
  orderId: string
  transportType: string | null
  stages: StageRow[]
  onBack: () => void
  onChanged: () => void
}) {
  return (
    <DocumentsRegistrySection
      packageUrl={`/api/admin/orders/${orderId}/package`}
      zipUrl={`/api/admin/orders/${orderId}/package/zip`}
      documentsUrl={`/api/admin/orders/${orderId}/documents`}
      versionsUrlFor={(docId) => `/api/admin/documents/${docId}/versions`}
      deleteUrlFor={(docId) => `/api/admin/documents/${docId}`}
      lifecycleUrlFor={(docId) => `/api/admin/documents/${docId}`}
      submitUrlFor={(docId) => `/api/admin/documents/${docId}/status`}
      stagePatchUrlFor={(docId) => `/api/admin/documents/${docId}`}
      stages={stages.map((s) => ({ stageCode: s.stageCode, name: s.name }))}
      transportType={transportType}
      canMarkInternal
      permitsCreateUrl={`/api/admin/orders/${orderId}/permits`}
      permitsPatchUrlFor={(permitId) => `/api/admin/permits/${permitId}`}
      permitViewer="staff"
      onBack={onBack}
      onChanged={onChanged}
    />
  )
}
