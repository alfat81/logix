import { db } from '../src/lib/db'

// Поиск заявок с документами для смоук-скриншотов гейта 1 (T21-07).
async function main() {
  const orders = await db.order.findMany({
    where: { documents: { some: {} } },
    select: {
      id: true,
      number: true,
      transportType: true,
      _count: { select: { documents: true, permitRequirements: true } },
    },
    orderBy: { createdAt: 'desc' as const },
    take: 5,
  })
  console.log(JSON.stringify(orders, null, 1))
  await db.$disconnect()
}
void main()
