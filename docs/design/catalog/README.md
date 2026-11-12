# Каталог Design System — TU-01.2 (принят TU-G1, решение A-3)

**Статус:** принят владельцем 12.11.2026 (решение TU-G1: A-3 — согласно референсу
`docs/design/reference/tu01/ux-pilot/Designsystem.png`). BRANDBOOK v2.0 утверждён (A-1);
волны TU-01.5–01.8 разблокированы (D81).

## 1. Состав

| Артефакт | Где | Что показывает |
|---|---|---|
| Живая страница каталога | `/design-system` (`src/app/design-system/page.tsx`) | Реальный рендер токенов и компонентов в обеих темах: палитра, типографика, кнопки и состояния, статусные бейджи, поверхности/формы/фокус. Индексация запрещена. |
| Семантические токены | `src/app/globals.css` | 17 канонических токенов `--c-*` (background, surface, surface-secondary, text-primary, text-secondary, text-muted, border, divider, accent, accent-hover, accent-pressed, success, warning, danger, info, focus, disabled) — значения для **обеих** тем + пары кнопок/состояний (`--c-accent-strong`, `--c-accent-tint`, `--c-accent-text` — TU-01.5/Д-17, `--c-*-fg`). Hex — только в этом файле (RULES 2.14). |
| Типографика | `src/fonts/` + `src/app/layout.tsx` | IBM Plex Sans 400/500/600/700, IBM Plex Mono 400/500/600 — `next/font/local`, woff2 (latin+cyrillic, OFL, `OFL-IBMPlex.txt`). Сборка не зависит от Google Fonts (V-1/D79; проверено: 0 обращений в build). |
| Механизм тем | `src/lib/theme.ts`, `src/components/theme-provider.tsx`, `theme-toggle.tsx` | Light / Dark / System, cookie `logix-theme` (Path=/, срок 1 год, SameSite=Lax, Secure в production — V-3), boot-скрипт от FOUC, режим System слушает `prefers-color-scheme`. Без новых npm-зависимостей (V-4). |
| Контраст WCAG 2.2 AA | `docs/design/contrast-pairs.json` + `scripts/contrast_check.py` (IC-17) | Пары обеих тем; пороги 4,5 текст / 3,0 UI. Прогон: `python3 scripts/contrast_check.py` — 0 находок. |
| Юнит-тесты темы | `src/lib/theme.test.ts` | Разбор cookie/режимов, атрибуты куки, разрешение System, сериализация. |
| Компоненты состояний | `src/components/states/` (TU-01.4) | Единые loading / empty / error / success / validation (`LoadingState`, `EmptyState`, `ErrorState`, `SuccessState`, `FieldError`) — цвета только токенами, роли a11y (status/alert); vitest-тест обеих тем (`states.test.tsx`, jsdom — devDep только для тестов); раздел 6 живого каталога. Внедрение по экранам — волны TU-01.6–01.8. |
| Переключатель темы в интерфейсах | `theme-toggle.tsx` + лэйауты (TU-01.3) | Публичная навигация и шапки трёх кабинетов (admin — оба брейкпоинта); единые базовые стили кнопки внутри компонента. |

## 2. Прослеживаемость «токен → значение → референс» (TU-01.0)

Светлая тема — LIGHT REBRANDING V2.0 и поручение владельца §5 (12.11.2026):
Ivory `#FAF3E0` (фон), `#FFFFFF` (поверхности), `#F1E9D4` (вторичная поверхность — выборка
референса), графит `#2B2A26` (текст), Slate `#3D3C38` (вторичный текст), Terracotta `#D95D39`
(акцент), Red Signal `#BF4A27` (усиленный акцент/заливки кнопок), Success `#2F6A3F`.

Тёмная тема — Executive DS V2.0 / набор UX Pilot (выборка доминирующих цветов макетов
Designsystem.png, commandcenter.png, clientcabinet.png, brockercabinet.png):
фон `#2B2A26`, поверхности `#1B1B1B`, приподнятые тона `#2E2D29`/`#232220`, текст `#F7F6F2`,
рамки — дериват `#3A3833` тона `#35332F`. Акценты Terracotta/Red Signal — те же; текстовые
сигналы осветлены до контраста ≥ 4,5:1 (отдельные токены — не механическая инверсия Light).

## 3. Ключевые решения (к подтверждению на TU-G1)

1. **Кнопки** — заливка `#BF4A27` (Red Signal) с белым текстом 4,97 ≥ 4,5. Белый на чистой
   Terracotta `#D95D39` даёт 3,77 < 4,5 (только крупный/UI) — отклонение от «белого на
   терракоте» в макетах зафиксировано в реестре отклонений (§4).
2. **Текст сигнала danger (Light)** — `#B8451F` (дериват Red Signal): `#BF4A27` на Ivory даёт
   4,49 < 4,5. Заливки кнопок остаются `#BF4A27`.
3. **Первый вход** — режим **System** (нет сохранённого выбора → тема по настройкам ОС/браузера,
   замечание 2 владельца); Executive Dark — основная визуальная модель референса, Light —
   альтернативная; стартовая тема не хардкодится.
4. **warning/info** — референс значений не фиксирует: Light — Coral `#F28C8C` (принятая пара
   брендбука v1.3) и нейтральный тёплый; тёмные дериваты. В реестре отклонений.

## 4. Реестр отклонений и открытых вопросов

Ведётся в `docs/design/tu01-DEVIATIONS.md` (артефакт TU-G1 по правилу TU-01.0):
каждое отступление от референса — не решение разработчика, а вопрос владельцу.

## 5. Проверка каталога (критерий приёмки TU-01.2)

- `python3 scripts/contrast_check.py` → 0 находок (33 пары, обе темы).
- Визуальная проверка обеих тем на `/design-system` (переключатель темы) — скриншоты
  прикладываются к отчёту TU-01.2; rg-аудит hex — дополнительный, не заменяющий (замечание 5).
- `npm run inventory` (IC-12) и `npm run integrity` — зелёные; «новых hex вне globals.css — 0».
- Юнит-тесты `vitest run src/lib/theme.test.ts` — 13/13.
