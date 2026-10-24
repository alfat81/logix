import { db } from '@/lib/db'
import { AttentionScreen } from '@/components/admin/AttentionScreen'
import { SideActivityFeed, type SideActivityItem } from '@/components/admin/SideActivityFeed'

// Ж5: главная страница — «Требует внимания» (просрочка, проблемы,
// неназначенные исполнители, лиды без движения). Список заявок
// переехал на /admin/orders, меню ведёт в оба раздела.
//
// P1-18 (BRANDBOOK §4): workspace 280px | 1fr | 320px. Навигацию даёт
// layout, список — AttentionScreen, третья колонка — свежие события по
// всем сделкам (журнал Ж2 в масштабе платформы). При < 1280px (xl)
// третья колонка складывается вниз — §4 адаптив не задаёт, решение
// зафиксировано здесь (BRANDBOOK §7 этап B).
export default async function AdminPage() {
  const rows = await db.activity.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  const items: SideActivityItem[] = rows.map((a) => ({
    id: a.id,
    actorName: a.actorName,
    type: a.type,
    description: a.description,
    isInternal: a.isInternal,
    createdAt: a.createdAt,
    leadId: a.leadId,
    orderId: a.orderId,
  }))

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-6">
      <div className="min-w-0">
        <AttentionScreen />
      </div>
      <aside className="mt-6 xl:mt-0 self-start xl:sticky xl:top-14">
        <SideActivityFeed items={items} />
      </aside>
    </div>
  )
}
