// Данные для скриншотов v0.7.11: bun scripts/pg_client/shot_data.mjs
// Заявка с разрешительными (e2e-фикстуры) + телефоны людей входа.
// Лиду-запросу без строк добавляются 2 строки (визуальная приёмка секции).
import { Client } from 'pg'

const c = new Client({ connectionString: 'postgresql://logix@127.0.0.1:5432/logix' })
await c.connect()
const order = await c.query(
  `SELECT o.id, o.number FROM "Order" o
   JOIN "PermitRequirement" p ON p."orderId" = o.id
   WHERE p.title LIKE '%Просроченный DF16%' LIMIT 1`
)
const clientUser = await c.query(
  `SELECT phone FROM "CustomerUser" WHERE email LIKE 'df03-client-%' LIMIT 1`
)
// Первичный пользователь брокера (человек df03-buser деактивирован e2e)
const brokerUser = await c.query(
  `SELECT phone FROM "Broker" WHERE email LIKE 'df03-broker-%' LIMIT 1`
)
const lead = await c.query(
  `SELECT l.id FROM "Lead" l
   LEFT JOIN "Order" o ON o."leadId" = l.id
   WHERE o.id IS NULL AND l.status = 'new'
   ORDER BY l."createdAt" DESC LIMIT 1`
)
const lid = lead.rows[0]?.id ?? null
if (lid) {
  const has = await c.query(
    `SELECT count(*)::int AS n FROM "PermitRequirement" WHERE "leadId" = $1`,
    [lid]
  )
  if (has.rows[0].n === 0) {
    await c.query(
      `INSERT INTO "PermitRequirement"
        ("id","leadId","title","providedBy","isBlocking","status","source","createdByType","createdByName","createdAt","updatedAt")
       VALUES
        ('shotperm-1',$1,'Фитосанитарный сертификат (скриншот)','client',false,'pending','manual','employee','Мастер Logix',now(),now()),
        ('shotperm-2',$1,'Разрешение СИТЕС (скриншот)','client',true,'pending','manual','employee','Мастер Logix',now(),now())`,
      [lid]
    )
  }
}
console.log(JSON.stringify({
  order: order.rows[0] ?? null,
  client: clientUser.rows[0] ?? null,
  broker: brokerUser.rows[0] ?? null,
  lead: lid ? { id: lid } : null,
}))
await c.end()
