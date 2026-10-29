# RELEASE-NOTES v0.6.8-fix1 — хотфикс: красный CI gitleaks на артефакте разведки ТН ВЭД

Дата: 29.10.2026. Основание: красный job `gitleaks` в GitHub Actions на
снапшот-пуше `151978e` (v0.6.8). Формат: патч-архив (прецедент
fix1/fix2/fix3 v0.6.7), `version` в package.json не меняется. Код приложения
не задет — только CI-конфиг, артефакт разведки и docs.

## Симптом

Job «gitleaks» красный на push `151978e`:

```
RuleID:  generic-api-key
Entropy: 4.665311
File:    scripts/hs-source/ett-page.html
Line:    49
```

## Причина

`scripts/hs-source/ett-page.html` — сохранённая в разведке DF-17C копия
страницы ЕТТ tws.by (доказательство источника, `docs/REFERENCES-SOURCES.md`).
На строке 49 — собственный публичный фронтенд-конфиг ЭТОЙ СТОРОННЕЙ страницы:
`window['recaptchaFreeOptions'] = {'size':'invisible','theme':'light', ...,
'lang':'ru','key':'…'}`. Это site key reCAPTCHA третьей стороны (публикуется
в HTML каждому посетителю сайта tws.by), а не секрет LogX. Правило
`generic-api-key` сработало на энтропии значения по ключевому слову `key`.
Одновременно платформенный снапшот-пуш `151978e` (сквош всего релиза одним
коммитом поверх `cddc368`) обошёл контрольные точки владельца из RULES 2.16.

Дополнительно: в базовый архив `logix-v0.6.8.zip` попал служебный файл
состояния конвейера `.release-v068-state.json` — его нет в списке
«ожидается», в репозиторий ему не место (в fix1 он не входит, инструкция
rev. B удаляет его перед коммитом).

## Фикс

- `.gitleaks.toml` (новый): `[extend] useDefault = true` + allowlist пути
  `^scripts/hs-source/` с описанием причины — развед-артефакты (сохранённые
  страницы третьих сторон) содержат публичные конфиги этих сторон;
- `scripts/hs-source/ett-page.html`: значение стороннего ключа на строке 49
  заменено на `[REDACTED]` (структура страницы и текст ЕТТ не тронуты —
  доказательная ценность источника сохранена);
- `docs/releases/RELEASE-INSTRUCTIONS-v0.6.8.md` → **rev. B**: Шаг 0 — откат
  снапшот-пуша по Шагу 3 RULES 2.16 (`git revert HEAD --no-edit && git push`),
  распаковка базы + патча, `Remove-Item .release-v068-state.json`, строка
  `A .gitleaks.toml` добавлена первой в список «ожидается» (КТ2).

CI после шага 0 (revert) зелёный на составе v0.6.7; повторный релиз уже
несёт allowlist и отредактированный файл в составе — gitleaks зелёный.

## Состав патч-архива logix-v0.6.8-fix1.zip

- `.gitleaks.toml`
- `scripts/hs-source/ett-page.html`
- `docs/releases/RELEASE-INSTRUCTIONS-v0.6.8.md` (rev. B)
- `docs/releases/RELEASE-NOTES-v0.6.8-fix1.md` (этот файл)
