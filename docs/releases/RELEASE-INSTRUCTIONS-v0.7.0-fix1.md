# RELEASE-INSTRUCTIONS v0.7.0-fix1

Патч к v0.7.0. Без миграций, без сида, версия пакета не меняется (0.7.0).

## 1. Распаковка

Архив `logix-v0.7.0-fix1.zip` содержит ТОЛЬКО изменённые файлы (пути сохранены). Распаковать в `C:\PROJECTS\logix` поверх (заменить 4 файла кода + 2 документа):

```powershell
Expand-Archive -Path .\logix-v0.7.0-fix1.zip -DestinationPath C:\PROJECTS\logix -Force
```

Состав архива:

- `src/lib/customs.ts`
- `src/lib/customs.test.ts`
- `src/components/admin/customs/CustomsCalcForm.tsx`
- `scripts/seed.ts`
- `docs/releases/RELEASE-NOTES-v0.7.0-fix1.md`
- `docs/releases/RELEASE-INSTRUCTIONS-v0.7.0-fix1.md`

## 2. Проверки локально (необязательно, всё прогнано в песочнице)

```powershell
npx prisma@6 generate   # только если bun install чистый; схема Prisma НЕ менялась
bun run test            # ожидание: 264/264
```

## 3. KT1 / KТ2 и публикация

```powershell
git status --short      # ожидание: 4 изменённых файла + 2 документа
git add -A
git commit -m "release v0.7.0-fix1: DF-19 — курс с запятой (cbr-формат) принимается и нормализуется; конкретная подсказка у неактивной кнопки; сид — гард плейсхолдеров + PowerShell-подсказка (vitest 264, e2e 343)"
git push origin main
```

## 4. CI и Vercel

- CI — зелёный ожидание (прогон песочницы: vitest 264/264, tsc 0, eslint 0, build OK, e2e 343/343). Красный — прислать лог, откат `git revert HEAD --no-edit && git push origin main`.
- Vercel → Deployments → Ready. Env не менялся, миграций нет — ничего кроме пуша не требуется.

## 5. Смоук (прод)

1. Карточка запроса → «Расчёт таможенных платежей» → «Рассчитать платежи».
2. Условие поставки FOB, строка: код 0102296100, стоимость 3900 USD, вес нетто 198, пошлина 5, НДС 22; даты 27.10.2026; курс вручную **с запятой**: `80,9604`.
3. «Сохранить расчёт» → расчёт сохраняется; итог: ТС 315 745,56 ₽ · пошлина 15 787,28 · НДС 72 937,22 · сбор 2 462,00 · платежи 91 186,50 ₽ · подпись «Оценка. Окончательные платежи определяются при декларировании».
4. Кнопка без выбранного условия поставки — подпись «Выберите условие поставки…».

## Откат

`git revert HEAD --no-edit && git push origin main`. БД не затронута — патч только код/UX.
