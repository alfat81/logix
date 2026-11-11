import type { PrismaClient } from '@prisma/client'
import type { Prisma } from '@prisma/client'

// ─── DF-27 волна 2 (Р-5/Р-3): скоупинг клиентских роутов сделки ─────
// Общий пролог клиентских GET-роутов своей сделки: «только свой объект,
// чужой — 404» (прецедент documents/select-option). Одна точка знания —
// дубликаты пролога в новых роутах исключены (IC-14).

export async function ownLeadOr404(
  db: Prisma.TransactionClient | PrismaClient,
  id: string,
  customerId: string
): Promise<{ id: string } | null> {
  return db.lead.findFirst({
    where: { id, customerId },
    select: { id: true },
  })
}

export async function ownOrderOr404(
  db: Prisma.TransactionClient | PrismaClient,
  id: string,
  customerId: string
): Promise<{ id: string } | null> {
  return db.order.findFirst({
    where: { id, customerId },
    select: { id: true },
  })
}
