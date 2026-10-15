// Быстрый инспектор БД (bun scripts/q-db.mjs) — счётчики и справочники
// для диагностики. Читает DATABASE_URL из окружения/.env. При инспекции
// НЕосновной БД передавать явный DATABASE_URL (реальная env-переменная
// бьёт .env cwd — тот же механизм, что дал утечку smoke → основная БД).
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const le = await db.legalEntity.findMany({ select: { id: true, name: true } })
console.log('LegalEntities:', JSON.stringify(le))
const stages = await db.orderStageCatalog.findMany({ orderBy: { order: 'asc' }, select: { code: true, isMandatory: true } })
console.log('Stages:', stages.map(s => `${s.code}${s.isMandatory ? '*' : ''}`).join(', '))
console.log('counts:', JSON.stringify({ customers: await db.customer.count(), contracts: await db.contract.count(), orders: await db.order.count(), leads: await db.lead.count(), options: await db.quoteOption.count() }))
await db.$disconnect()
