# -*- coding: utf-8 -*-
"""Драйвер: применяет PAIRS_A + PAIRS_B к v1.5 → DOC-CENTER-SPEC-v1.6.md и верифицирует."""
import sys
from pathlib import Path

sys.path.insert(0, '/home/z/my-project/scripts')
from build_spec_v16 import PAIRS_A  # noqa: E402
from spec_v16_pairs_b import PAIRS_B  # noqa: E402

SRC = Path('/home/z/my-project/download/DOC-CENTER-SPEC-v1.5.md')
DST = Path('/home/z/my-project/download/DOC-CENTER-SPEC-v1.6.md')

s = SRC.read_text(encoding='utf-8')
missed = []
for i, (old, new) in enumerate(PAIRS_A + PAIRS_B, 1):
    n = s.count(old)
    if n == 0:
        missed.append(f'{i}: НЕ НАЙДЕНО: {old[:90]!r}')
    elif n > 1:
        missed.append(f'{i}: НЕЕДИНСТВЕННО ({n}x): {old[:90]!r}')
    else:
        s = s.replace(old, new)

if missed:
    print('ПРОПУЩЕНО:')
    for m in missed:
        print(' -', m)
    raise SystemExit(1)

if not s.endswith('\n'):
    s += '\n'
DST.write_text(s, encoding='utf-8')
print(f'Применено {len(PAIRS_A) + len(PAIRS_B)} пар → {DST}')

# ── Верификация результата ──────────────────────────────────────────────────
must_have = [
    'ФИНАЛЬНАЯ РЕДАКЦИЯ — НА УТВЕРЖДЕНИЕ',
    'Журнал изменений редакции 1.6',
    'дифф-сохранение',
    "bindingState = 'pending_manual'",
    '«требует ручной привязки»',
    'erd-docs-center-v15',
    'не является ни разрешением на старт волны 1',
    'chk_permitreq_binding_state',
    'PUT /api/broker/leads/[id]/estimate',
    'удаление и добавление позиции с тем же кодом при неизменном количестве строк',
]
problems = []
for t in must_have:
    if t not in s:
        problems.append(f'ОТСУТСТВУЕТ: {t}')

def section_of(line_no: int, lines: list[str]) -> str:
    """Заголовок ближайшего раздела выше строки."""
    for i in range(line_no - 2, -1, -1):
        if lines[i].startswith('## '):
            return lines[i]
    return '(шапка)'

HIST_OK_PREFIXES = ('## Журнал изменений редакции 1.5', '## Журнал изменений редакции 1.4',
                    '## Журнал изменений редакции 1.3', '## Журнал изменений редакции 1.2',
                    '## Журнал изменений редакции 1.1')
TAIL_OK = 'Редакция 1.5 — два замечания'

old_terms = ['порядок в группе', 'численности группы', 'равной численности', 'NULL с слиянием',
             'remap привязок по трём шагам', 'remap по трём шагам', 'перенос по коду']
lines_list = s.splitlines()
for t in old_terms:
    start = 0
    while True:
        idx = s.find(t, start)
        if idx == -1:
            break
        line_no = s.count('\n', 0, idx) + 1
        sec = section_of(line_no, lines_list)
        line = lines_list[line_no - 1]
        in_hist = any(sec.startswith(p) for p in HIST_OK_PREFIXES)
        negation = any(m in line for m in ('отменён', 'нет ни при', 'не участвуют',
                                           'не критерии', 'НЕ критерии', 'упраздня',
                                           'отклонён', 'отклонил'))
        if not in_hist and not line.startswith('**Редакция 1.5') and not negation:
            problems.append(f'ЖИВОЙ ОСТАТОК (строка {line_no}, раздел {sec[:60]}): {t} :: {line[:120]}')
        start = idx + 1

if problems:
    print('ПРОБЛЕМЫ ВЕРИФИКАЦИИ:')
    for p in problems:
        print(' -', p)
    raise SystemExit(1)

print(f'Верификация пройдена. Строк в v1.6: {len(lines_list)}')
