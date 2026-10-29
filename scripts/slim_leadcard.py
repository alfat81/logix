#!/usr/bin/env python3
"""P1-04: вырезает секцию вариантов из LeadCard.tsx (переехала в
QuoteOptionsSection) + чистит типы/state/handlers. Вырезание снизу
вверх, каждое — с проверкой содержимого границ (упадёт, если файл
уехал от ожидаемых номеров строк)."""
import sys

P = '/home/z/my-project/audit/logix-main/src/components/admin/LeadCard.tsx'
src = open(P, encoding='utf-8').read()
lines = src.split('\n')  # 0-based; строка N (1-based) = lines[N-1]


def check(idx1, needle):
    if needle not in lines[idx1 - 1]:
        print(f'FAIL: строка {idx1} не содержит «{needle}»: {lines[idx1-1][:80]!r}')
        sys.exit(1)


# Проверки границ ДО вырезаний (все по исходной нумерации)
check(59, 'type QuoteOptionRow = {')
check(67, '}')
check(102, 'const fmtMoney')
check(106, 'type OptionForm = {')
check(120, '}')
check(130, '// Вариант расчёта')
check(134, 'savingOption')
check(220, 'const openAddOption')
check(316, '}')
check(318, 'const openConvert')
check(538, 'Варианты расчёта (В3)')
check(625, ')}')
check(627, 'Конвертация / заявка')
check(678, 'Диалог: вариант расчёта')
check(773, '</Dialog>')
check(775, 'Диалог: конвертация в заявку')

COMPONENT = [
    "      {/* ── Варианты расчёта (В3) — секция вынесена в компонент",
    "          (P1-04: деньги — валюта/НДС/себестоимость) ────────────── */}",
    "      <QuoteOptionsSection",
    "        leadId={String(id)}",
    "        options={lead.options}",
    "        disabled={isWon}",
    "        onChanged={load}",
    "      />",
]

IMPORTS = [
    "import { QuoteOptionsSection } from '@/components/admin/QuoteOptionsSection'",
    "import type { QuoteOptionRow } from '@/components/admin/QuoteOptionsSection'",
]


def cut(a, b, replace=None):
    """Вырезает строки [a..b] (1-based включительно), вставляя replace."""
    global lines
    lines = lines[: a - 1] + (replace or []) + lines[b:]


# Снизу вверх
cut(678, 774)                                   # диалог варианта + пустая строка
cut(538, 626, COMPONENT)                        # список вариантов → компонент
cut(220, 317)                                   # handlers вариантов
cut(130, 135)                                   # state вариантов + пустая
cut(106, 121)                                   # OptionForm + EMPTY + пустая
cut(102, 102)                                   # fmtMoney
cut(59, 68)                                     # type QuoteOptionRow + пустая

# Импорт компонента — после LeadEditDialog
for i, l in enumerate(lines):
    if "import { LeadEditDialog }" in l:
        lines[i + 1 : i + 1] = IMPORTS
        break
else:
    print('FAIL: не нашёл импорт LeadEditDialog')
    sys.exit(1)

open(P, 'w', encoding='utf-8').write('\n'.join(lines))
print(f'OK: {len(lines)} строк (было 898)')
