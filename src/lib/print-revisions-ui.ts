import { readApiResponse } from '@/lib/api-client'

// ─── DF-27 волна 2 (Р-3, D75): UI-слой печатных редакций ───────────
// Общие загрузка и подтверждение для админского и клиентского
// компонентов (LeadPrintRevisions / ClientLeadPrintRevisions) — одна
// точка запросов к API, дубликаты fetch-блоков исключены (IC-14).

export type PrintRevisionConfirmation = {
  partyRole: string
  actorName: string
  confirmedAt: string
}

export type PrintRevisionRow = {
  id: string
  seq: number
  contentHash: string
  createdAt: string
  createdByName?: string | null
  confirmations: PrintRevisionConfirmation[]
}

export function fetchPrintRevisions(
  role: 'admin' | 'client',
  leadId: string
): Promise<PrintRevisionRow[] | null> {
  const url =
    role === 'admin'
      ? `/api/admin/leads/${leadId}/print-revisions`
      : `/api/client/leads/${leadId}/print-revisions`
  return fetch(url).then(async (res) => {
    if (!res.ok) return []
    const data = await readApiResponse<{ revisions?: PrintRevisionRow[] }>(res)
    return data.revisions ?? []
  })
}

export async function confirmPrintRevisionUi(
  role: 'admin' | 'client',
  leadId: string,
  revisionId: string,
  contentHash: string
): Promise<{ ok: boolean; bothConfirmed: boolean; message: string; error: string }> {
  const url =
    role === 'admin'
      ? `/api/admin/leads/${leadId}/print-revisions/${revisionId}/confirm`
      : `/api/client/leads/${leadId}/print-revisions/${revisionId}/confirm`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentHash }),
  })
  const data = await readApiResponse<{ message?: string; error?: string; bothConfirmed?: boolean }>(res)
  if (!res.ok) {
    return { ok: false, bothConfirmed: false, message: '', error: data.error || 'Не удалось подтвердить' }
  }
  return { ok: true, bothConfirmed: data.bothConfirmed === true, message: data.message || 'Подтверждено', error: '' }
}
