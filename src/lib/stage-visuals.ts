import {
  Circle,
  Container,
  FileCheck2,
  Landmark,
  PackageCheck,
  PackageOpen,
  ShieldCheck,
  Truck,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'

// v0.3.1 (BRANDBOOK §4.3): визуал этапа в степпере карточки списка —
// круг с иконкой + caps-подпись («СКЛАД, ТАМОЖНЯ, ТРАНЗИТ, ВЫДАЧА»).
// Единая точка маппинга кода этапа → { иконка, короткая подпись } —
// паттерн lib/status-badges.ts (этап C): файл БЕЗ серверных
// зависимостей, импортируется только клиентскими компонентами.
//
// Каталог этапов редактируемый (справочник «Этапы»), поэтому словарь
// ТОЛЕРАНТЕН: незнакомый код получает фолбэк (первое слово названия
// caps + нейтральная иконка Circle) — степпер не ломается, а новый
// код добавляется сюда одной строкой.

type StageVisual = {
  icon: LucideIcon
  // Короткая подпись под кругом; рендерится uppercase-классом,
  // поэтому хранится в обычном регистре. Наименования — не длиннее
  // одного слова: кругов в ряд 6–8, подпись должна помещаться.
  short: string
}

// Ключи — коды каталога из scripts/seed.ts (6 обязательных + 2
// примера). Иконка — по смыслу этапа, не по статусу.
const STAGE_VISUALS: Record<string, StageVisual> = {
  export_pickup: { icon: PackageOpen, short: 'Забор' },
  export_customs: { icon: FileCheck2, short: 'Экспорт' },
  loading: { icon: Container, short: 'Погрузка' },
  transport: { icon: Truck, short: 'Перевозка' },
  import_customs: { icon: Landmark, short: 'Импорт' },
  final_delivery: { icon: PackageCheck, short: 'Выдача' },
  warehouse_storage: { icon: Warehouse, short: 'Склад' },
  cargo_insurance: { icon: ShieldCheck, short: 'Страховка' },
}

// Фолбэтч-подпись: первое слово названия, максимум 12 символов —
// «Экспортное таможенное оформление» → «Экспортное»; длиннее кругов
// ряд не растянет, а обрезка середины caps-строки выглядит хуже.
function fallbackShort(name: string, code: string): string {
  const first = (name || code).trim().split(/\s+/)[0] ?? code
  return first.length > 12 ? first.slice(0, 11) + '…' : first
}

export function stageVisual(code: string, name: string): StageVisual {
  return STAGE_VISUALS[code] ?? { icon: Circle, short: fallbackShort(name, code) }
}
