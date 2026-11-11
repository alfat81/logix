'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

// ─── Конвертация / заявка (В4; компонент lead/) ────────────────────
// Вынесено из LeadCard.tsx (DF-27 волна 1, RULES 2.14): баннер
// «конвертирован в заявку» — воронка завершена, история зафиксирована.
export function LeadConvertedBanner({ order }: { order: { id: string; number: string } }) {
  return (
    <Card className="p-4 flex flex-wrap items-center gap-4 border-success/50 bg-success/5">
      <div className="flex-1">
        <div className="font-medium">Конвертирован в заявку</div>
        <div className="text-sm text-muted-foreground">
          Воронка завершена — история запроса зафиксирована
        </div>
      </div>
      <Button asChild>
        <Link href={`/admin/orders/${order.id}`}>
          Заявка {order.number}
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </Card>
  )
}
