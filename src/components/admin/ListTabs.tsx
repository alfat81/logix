import { cn } from '@/lib/utils'

// v0.4.0 (BRANDBOOK §4.2, D25): общий компонент табов-фильтров шапки
// списка — единый вид для заявок и лидов (эталон паттерна списка Ж4).
// Активный таб — Ink, Medium, с подчёркиванием Coral (border-primary);
// неактивные — приглушённые. Число — распределение найденного по тому
// же поиску (API counts), tabular-nums. Состав табов задаёт
// информационная архитектура раздела (§8.8): у заявок и лидов —
// по-статусные (решение владельца D25).
export type ListTab = {
  key: string
  label: string
  count?: number | null
}

export function ListTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: ListTab[]
  active: string
  onChange: (key: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b pb-1">
      {tabs.map((t) => {
        const isActive = active === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-current={isActive ? 'true' : undefined}
            className={cn(
              '-mb-1 border-b-2 pb-1.5 text-sm transition-colors',
              isActive
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
            {t.count !== undefined && t.count !== null && (
              <span className="ml-1.5 tabular-nums text-muted-foreground">{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
