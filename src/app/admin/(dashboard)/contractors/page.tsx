import { ContractorsClient } from './ContractorsClient'
import { contractorPortalEnabled } from '@/lib/flags'

// Подрядчики (Дорожка Г): воронка квалификации кандидатов + пул
// исполнителей на одной странице — контур «нашли → проверили → в
// работе». v0.5.3 (DF-00C): страница — серверный компонент: флаг
// CONTRACTOR_PORTAL_ENABLED читается здесь (D31, кабинет подрядчика
// заморожен по умолчанию) и передаётся пропсами в клиентское тело —
// в диалогах выдачи доступа поля пароля скрываются при false.
export default function ContractorsPage() {
  return <ContractorsClient portalEnabled={contractorPortalEnabled()} />
}
