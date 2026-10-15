import { BrokersList } from '@/components/admin/BrokersList'

// Брокеры (Дорожка Д, роадмап 5а): справочник таможенных
// представителей. Воронки квалификации (как у подрядчиков Г) нет —
// менеджер заводит брокера сразу с логином портала.
export default function BrokersPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Брокеры</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Таможенные представители: подключаются к сделке с этапа расчёта,
          видят её целиком, сообщают таможенные платежи и разрешительные
          документы.
        </p>
      </div>
      <BrokersList />
    </div>
  )
}
