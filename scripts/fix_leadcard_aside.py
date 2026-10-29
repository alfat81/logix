#!/usr/bin/env python3
"""LeadCard: перенос NoteForm + ActivityFeed в правую панель (BRANDBOOK §4, P1-18)."""
import io

P = 'src/components/admin/LeadCard.tsx'
s = io.open(P, encoding='utf-8').read()

n_note = '      <NoteForm targetType="lead" targetId={String(id)} onAdded={load} />'
n_feed = '      <ActivityFeed'
n_close = '      />'

i_note = s.index(n_note)                      # первый вхождение — единственное
i_cstart = s.rindex('      {/*', 0, i_note)   # начало комментария Ж3 перед NoteForm
i_feed = s.index(n_feed, i_note)
i_end = s.index(n_close, i_feed) + len(n_close)

old = s[i_cstart:i_end]
assert 'ActivityFeed' in old and 'NoteForm' in old and old.count('<') >= 2, 'span sanity'

new = (
    '      </div>\n'
    '\n'
    '      {/* P1-18: правая панель «Детали/Журнал» (BRANDBOOK §4, 320px):\n'
    '          заметка (Ж3) + лента (Ж2). Sticky на xl — контекст не\n'
    '          теряется при длинной анкете; на < xl — блок внизу. */}\n'
    '      <aside className="space-y-4 min-w-0 xl:sticky xl:top-14">\n'
    '        {/* Ж3: внутренняя заметка — пишется в ленту, видна только\n'
    '            сотрудникам (подрядчику/клиенту isInternal не отдаётся) */}\n'
    '        <NoteForm targetType="lead" targetId={String(id)} onAdded={load} />\n'
    '\n'
    '        {/* Ж2: лента событий — хроника лида (создание, варианты,\n'
    '            статусы, конвертация) */}\n'
    '        <ActivityFeed\n'
    '          activities={lead.activities}\n'
    '          emptyText="Событий пока нет — журнал начнётся с первого действия"\n'
    '        />\n'
    '      </aside>'
)

s = s[:i_cstart] + new + s[i_end:]
io.open(P, 'w', encoding='utf-8').write(s)

# Контроль баланса скобок/тегов на глаз + счётчики
chk = io.open(P, encoding='utf-8').read()
print('aside opens :', chk.count('<aside'))
print('aside closes:', chk.count('</aside>'))
print('NoteForm    :', chk.count('<NoteForm'))
print('ActivityFeed:', chk.count('<ActivityFeed'))
print('div open left:', chk.count('<div className="space-y-4 min-w-0">'))
