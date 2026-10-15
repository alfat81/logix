import { LegalEntitiesList } from '@/components/admin/LegalEntitiesList'

// Юрлица (Ж6б): справочник наших компаний — реквизиты для печатных
// форм, деактивация, счётчики договоров и заявок. Создание и правка
// в диалогах, отдельной карточки нет (справочник плоский).
export default function LegalEntitiesPage() {
  return <LegalEntitiesList />
}
