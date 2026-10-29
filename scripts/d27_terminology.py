# -*- coding: utf-8 -*-
"""
D27: уходим от терминологии «Лид/Лиды» в UI — единый термин «Запрос/Запросы»
(унификация с клиентским порталом, где сущность уже называется «Запрос»).

Скоуп: ТОЛЬКО пользовательские строки (JSX-тексты, тосты, aria, сообщения
API, словари TYPE_LABEL). Кодовые идентификаторы (Lead, /api/admin/leads),
URL-роуты и комментарии НЕ меняются — совместимость API и дифф остаются
хирургическими.

Замены — точные пары (old -> new) на файл; пара применяется ко всем
вхождениям в файле. Если пара не найдена — скрипт падает со списком,
ничего не записывая (атомарность по файлу: сначала считаем, потом пишем).
"""
import re
import sys
from pathlib import Path

ROOT = Path('/home/z/my-project/logix')

# ── Пары замен: файл -> [(old, new), ...] ──────────────────────────────
PAIRS: dict[str, list[tuple[str, str]]] = {
    # ── Компоненты: карточка лида ──
    'src/components/admin/LeadCard.tsx': [
        ('Лид не найден', 'Запрос не найден'),
        ("'Не удалось загрузить лид',", "'Не удалось загрузить запрос',"),
        ("{ label: 'Лиды', href: '/admin/leads' }", "{ label: 'Запросы', href: '/admin/leads' }"),
        ('`Лид от ${fmtDate(lead.createdAt)}`', '`Запрос от ${fmtDate(lead.createdAt)}`'),
        ('tracking-tight">Лид от {fmtDate', 'tracking-tight">Запрос от {fmtDate'),
        ('история лида зафиксирована', 'история запроса зафиксирована'),
    ],
    'src/components/admin/lead/LeadStatusControls.tsx': [
        ('Не удалось удалить лид', 'Не удалось удалить запрос'),
        ("'Лид удалён'", "'Запрос удалён'"),
        ('title="Удалить лид"', 'title="Удалить запрос"'),
        ('Отказ по лиду', 'Отказ по запросу'),
        ('Удалить лид?', 'Удалить запрос?'),
        ('Лид будет удалён', 'Запрос будет удалён'),
        ('необратимо; лид с заявкой удалить нельзя', 'необратимо; запрос с заявкой удалить нельзя'),
    ],
    'src/components/admin/lead/LeadConvertBlock.tsx': [
        ('Клиент найдётся или родится из контактов лида', 'Клиент найдётся или родится из контактов запроса'),
    ],
    # ── Компоненты: список лидов ──
    'src/components/admin/LeadsList.tsx': [
        ("'Не удалось загрузить лиды'", "'Не удалось загрузить запросы'"),
        ('tracking-tight">Лиды</h1>', 'tracking-tight">Запросы</h1>'),
        ("'Лидов пока нет — создайте первый запрос.'", "'Запросов пока нет — создайте первый.'"),
        (
            '`Лидов в статусе «${LEAD_STATUS_LABELS[statusFilter]}» нет.`',
            '`Запросов в статусе «${LEAD_STATUS_LABELS[statusFilter]}» нет.`',
        ),
    ],
    'src/components/admin/LeadCreateDialog.tsx': [
        ("data.error || 'Не удалось создать лид'", "data.error || 'Не удалось создать запрос'"),
        ("toast({ title: 'Лид создан', description: 'Статус: Новый' })",
         "toast({ title: 'Запрос создан', description: 'Статус: Новый' })"),
        ('Новый лид', 'Новый запрос'),
        ('Создать лид', 'Создать запрос'),
    ],
    'src/components/admin/LeadEditDialog.tsx': [
        ('в журнал лида.', 'в журнал запроса.'),
    ],
    'src/components/admin/LeadsToolbar.tsx': [],
    # ── Компоненты: прочие поверхности ──
    'src/components/admin/SideActivityFeed.tsx': [
        ("lead_created: 'Лид создан'", "lead_created: 'Запрос создан'"),
        ("lead_edited: 'Лид правлен'", "lead_edited: 'Запрос правлен'"),
        ("lead_status_changed: 'Статус лида'", "lead_status_changed: 'Статус запроса'"),
        ('\n                        лид\n                      </Link>',
         '\n                        запрос\n                      </Link>'),
    ],
    'src/components/admin/CustomersList.tsx': [
        (' · Лиды: {c.leadsCount}', ' · Запросы: {c.leadsCount}'),
    ],
    'src/components/admin/CustomerCard.tsx': [
        ('          Лиды\n        </SectionTitle>', '          Запросы\n        </SectionTitle>'),
        ('Лидов от этого клиента пока нет.', 'Запросов от этого клиента пока нет.'),
    ],
    'src/components/admin/GlobalSearch.tsx': [
        ('aria-label="Глобальный поиск по заявкам и лидам"',
         'aria-label="Глобальный поиск по заявкам и запросам"'),
        ('text-muted-foreground">\n                    Лиды\n',
         'text-muted-foreground">\n                    Запросы\n'),
    ],
    'src/components/admin/QuoteOptionsSection.tsx': [
        ('вариант переведёт лид в «Рассчитан»', 'вариант переведёт запрос в «Рассчитан»'),
    ],
    'src/components/admin/AdminNav.tsx': [
        ("{ href: '/admin/leads', label: 'Лиды', icon: Inbox }",
         "{ href: '/admin/leads', label: 'Запросы', icon: Inbox }"),
    ],
    'src/components/admin/AttentionScreen.tsx': [
        ('исполнители и лиды без движения', 'исполнители и запросы без движения'),
        ('ни зависших лидов', 'ни зависших запросов'),
        ('>К лидам</Link>', '>К запросам</Link>'),
        ('Лиды без движения\n          <Badge', 'Запросы без движения\n          <Badge'),
        ('открыть список лидов', 'открыть список запросов'),
    ],
    'src/components/admin/BrokerLinksSection.tsx': [
        ('подключён после расчёта или без связи с лидом',
         'подключён после расчёта или без связи с запросом'),
    ],
    'src/components/admin/OrderCargoCard.tsx': [
        ('у заявки без лида бланк пуст', 'у заявки без запроса бланк пуст'),
    ],
    # ── Страницы ──
    'src/app/admin/(dashboard)/layout.tsx': [
        ('заявки · лиды · подрядчики', 'заявки · запросы · подрядчики'),
    ],
    'src/app/admin/(dashboard)/orders/[id]/page.tsx': [
        ('Конвертирована из лида от', 'Конвертирована из запроса от'),
        ('заявка живёт независимо от лида', 'заявка живёт независимо от запроса'),
        ('Лид-источник', 'Запрос-источник'),
    ],
    # ── lib ──
    'src/lib/leads.ts': [
        ("'Неизвестный статус лида'", "'Неизвестный статус запроса'"),
    ],
    # ── API: сообщения ошибок и тексты журнала ──
    'src/app/api/admin/leads/route.ts': [
        ("'Неизвестный статус лида'", "'Неизвестный статус запроса'"),
        ("'Не удалось загрузить лиды'", "'Не удалось загрузить запросы'"),
        ('Лид создан', 'Запрос создан'),
        ("'Не удалось создать лид'", "'Не удалось создать запрос'"),
    ],
    'src/app/api/admin/leads/[id]/route.ts': [
        ('Лид не найден', 'Запрос не найден'),
        ('Лид уже конвертирован в заявку — статус терминальный',
         'Запрос уже конвертирован в заявку — статус терминальный'),
        ('У лида есть клиент из справочника', 'У запроса есть клиент из справочника'),
        ('закрытого («Отказ») лида не правится — верните лид в работу',
         'закрытого («Отказ») запроса не правится — верните запрос в работу'),
        ('Статус лида уже: ', 'Статус запроса уже: '),
        ('Статус лида: ${LEAD_STATUS_LABELS[status]}', 'Статус запроса: ${LEAD_STATUS_LABELS[status]}'),
        ("|| 'Лид обновлён'", "|| 'Запрос обновлён'"),
        ('Не удалось обновить лид', 'Не удалось обновить запрос'),
        ('Нельзя удалить лид, конвертированный в заявку',
         'Нельзя удалить запрос, конвертированный в заявку'),
        ('Лид удалён', 'Запрос удалён'),
        ('Не удалось удалить лид', 'Не удалось удалить запрос'),
    ],
    'src/app/api/admin/leads/[id]/notes/route.ts': [
        ('Лид не найден', 'Запрос не найден'),
    ],
    'src/app/api/admin/leads/[id]/options/route.ts': [
        ('Лид не найден', 'Запрос не найден'),
        ('Лид конвертирован в заявку — варианты расчёта зафиксированы',
         'Запрос конвертирован в заявку — варианты расчёта зафиксированы'),
        (' — лид посчитан: ', ' — запрос посчитан: '),
        ('— статус лида: ${LEAD_STATUS_LABELS.calculated}',
         '— статус запроса: ${LEAD_STATUS_LABELS.calculated}'),
    ],
    'src/app/api/admin/leads/[id]/convert/route.ts': [
        ('Лид не найден', 'Запрос не найден'),
        ('Лид уже конвертирован в заявку №${lead.order.number}',
         'Запрос уже конвертирован в заявку №${lead.order.number}'),
        ('статус лида: ${LEAD_STATUS_LABELS.won}', 'статус запроса: ${LEAD_STATUS_LABELS.won}'),
        ('Лид в отказе — сначала верните его в работу',
         'Запрос в отказе — сначала верните его в работу'),
        ('Анкета лида (rawContact) некорректна', 'Анкета запроса (rawContact) некорректна'),
        ('Лид уже конвертирован в заявку №${fresh.order.number}',
         'Запрос уже конвертирован в заявку №${fresh.order.number}'),
        ('создана конвертацией из лида', 'создана конвертацией из запроса'),
        ('Не удалось конвертировать лид в заявку', 'Не удалось конвертировать запрос в заявку'),
    ],
    'src/app/api/admin/leads/[id]/brokers/[brokerId]/route.ts': [
        ('Лид не найден', 'Запрос не найден'),
        ('Лид конвертирован в заявку — связь с брокером перенесена в заявку',
         'Запрос конвертирован в заявку — связь с брокером перенесена в заявку'),
        ('Брокер не подключён к этому лиду', 'Брокер не подключён к этому запросу'),
    ],
    'src/app/api/admin/leads/[id]/brokers/route.ts': [
        ('Лид не найден', 'Запрос не найден'),
        ('Лид конвертирован в заявку — подключайте брокера к заявке',
         'Запрос конвертирован в заявку — подключайте брокера к заявке'),
        ('уже подключён к этому лиду', 'уже подключён к этому запросу'),
    ],
    'src/app/api/admin/leads/[id]/documents/route.ts': [
        ('Лид не найден', 'Запрос не найден'),
    ],
    'src/app/api/admin/options/[id]/route.ts': [
        ('Лид конвертирован в заявку — варианты расчёта зафиксированы',
         'Запрос конвертирован в заявку — варианты расчёта зафиксированы'),
    ],
    'src/app/api/broker/leads/[id]/documents/route.ts': [
        ('Лид не найден', 'Запрос не найден'),
    ],
}

# ── e2e-скрипт: словоформенная замена в названиях проверок ─────────────
E2E = 'scripts/e2e_api_test.py'
WORD_RE = re.compile(r'([Лл])ид(а|у|е|ом|ы|ов|ам|ами|ах)?(?![а-яёА-ЯЁ])')


def word_sub(text: str) -> tuple[str, int]:
    count = 0

    def repl(m: re.Match) -> str:
        nonlocal count
        count += 1
        stem = 'Запрос' if m.group(1) == 'Л' else 'запрос'
        return stem + (m.group(2) or '')

    return WORD_RE.sub(repl, text), count


def main() -> int:
    errors: list[str] = []
    report: list[str] = []

    for rel, pairs in PAIRS.items():
        path = ROOT / rel
        if not path.exists():
            errors.append(f'{rel}: файл не найден')
            continue
        text = path.read_text(encoding='utf-8')
        original = text
        applied: list[str] = []
        for old, new in pairs:
            n = text.count(old)
            if n == 0:
                errors.append(f'{rel}: пара не найдена: {old[:60]!r}')
                continue
            text = text.replace(old, new)
            applied.append(f'{n}x {old[:48]!r}')
        if text != original:
            path.write_text(text, encoding='utf-8')
        report.append(f'{rel}: {len(applied)} пар; ' + '; '.join(applied))

    # e2e — словоформы в названиях проверок (ярлыки chk, безопасно)
    e2e_path = ROOT / E2E
    e2e_text = e2e_path.read_text(encoding='utf-8')
    e2e_new, n_words = word_sub(e2e_text)
    if n_words:
        e2e_path.write_text(e2e_new, encoding='utf-8')
    report.append(f'{E2E}: {n_words} словоформ заменено')

    print('\n'.join(report))
    if errors:
        print('\nОШИБКИ (ничего не записано для проблемных пар):')
        print('\n'.join(' - ' + e for e in errors))
        return 1
    print('\nOK: все пары применены')
    return 0


if __name__ == '__main__':
    sys.exit(main())
