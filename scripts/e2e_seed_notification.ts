/**
 * DF-04 e2e-фикстура: «искусственно сломанный транспорт» — строка
 * failed в очереди уведомлений.
 *
 * Зачем скрипт: в e2e-окружении EMAIL_PROVIDER=fake — fake-транспорт
 * не падает, «сломать» доставку через публичный API нельзя (allowlist
 * в production отключён, resend без ключей не сконфигурировать
 * точечно). Критерий приёмки DF-04 требует именно failed-строку:
 * «искусственно сломанный транспорт виден мастеру в списке и в
 * "Требует внимания"». Фикстура честно создаёт состояние «письмо
 * пережило пять попыток диспетчера» прямой записью в БД — тот же
 * паттерн, что scripts/seed.ts для первичного наполнения.
 *
 * Запуск (из e2e_api_test.py, cwd = корень репозитория):
 *   bun scripts/e2e_seed_notification.ts --to <addr> --dedup <key>
 * Печатает stdout: {"id": "<cuid>"} — python парсит и дальше гоняет
 * журнал/повтор/диспетчер через HTTP.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function arg(name: string): string {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? (process.argv[i + 1] ?? '') : ''
}

async function main(): Promise<void> {
  const to = arg('to')
  const dedup = arg('dedup')
  if (!to || !dedup) {
    console.error('usage: bun scripts/e2e_seed_notification.ts --to <addr> --dedup <key>')
    process.exit(2)
  }
  const row = await prisma.notification.create({
    data: {
      recipientKind: 'employee',
      recipientId: null,
      toAddress: to,
      channel: 'email',
      mode: 'red',
      eventId: null,
      type: 'order_stage_problem',
      subject: 'DF-04 фикс: красное письмо (сломанный транспорт)',
      body:
        'Письмо-фикстура DF-04: доставка не удалась после пяти попыток.\n' +
        'Мастер видит его в журнале и в «Требует внимания», повтор возвращает в очередь.',
      status: 'failed',
      attempts: 5,
      lastError: 'resend 502: seed-fixture (искусственно сломанный транспорт)',
      dedupKey: dedup,
    },
  })
  console.log(JSON.stringify({ id: row.id }))
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(String(e).slice(0, 300))
    await prisma.$disconnect()
    process.exit(1)
  })
