# RELEASE-NOTES v0.6.8-fix2 — хотфикс: импорт ТН ВЭД падал по P2028 (таймаут транзакции)

Дата: 29.10.2026. Основание: обращение владельца — Шаг 9 деплоя v0.6.8,
после успешных миграций и `prisma generate`. Формат: патч-архив (прецедент
fix1/fix2/fix3 v0.6.7), `version` в package.json не меняется. Код приложения
не задет — только скрипт импорта и docs.

## Симптом

`npx tsx scripts/import-hs.ts` на машине владельца (Neon, eu-central-1, через
pooler по WAN):

```
Импорт ТН ВЭД упал: PrismaClientKnownRequestError:
Invalid `tx.hsCode.createMany()` invocation
Transaction API error: Transaction already closed: A query cannot be
executed on an expired transaction. The timeout for this transaction was
5000 ms, however 5440 ms passed since the start of the transaction.
code: 'P2028'
```

## Причина

Дефолтный таймаут интерактивной транзакции Prisma — **5 секунд**. Вставка
13 294 строк одним `createMany` до Neon через WAN в него не укладывается
(в песочнице дефект не воспроизводился: локальный PG отвечает за
миллисекунды). Транзакция атомарна — по таймауту всё откатилось, в БД
ничего не записалось, повторный запуск безопасен.

## Фикс

`scripts/import-hs.ts`: интерактивной транзакции задан явный таймаут —
`{ timeout: 60_000, maxWait: 10_000 }` (запас ×12 к наблюдённым 5,4 с).

## Состав патч-архива logix-v0.6.8-fix2.zip

- `scripts/import-hs.ts`
- `docs/releases/RELEASE-INSTRUCTIONS-v0.6.8.md`
- `docs/releases/RELEASE-NOTES-v0.6.8-fix2.md` (этот файл)

После распаковки fix2 список КТ2 (Шаг 4 инструкций) дополняется строкой
`M       scripts/import-hs.ts`. Миграции (Шаг 8) повторять не нужно.
