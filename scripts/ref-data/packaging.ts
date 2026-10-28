// ─── DF-17: справочные данные — УПАКОВКА ─────────────────────────────
// Источник: КЛАССИФИКАТОР ВИДОВ ГРУЗА, УПАКОВКИ И УПАКОВОЧНЫХ
// МАТЕРИАЛОВ (РЕКОМЕНДАЦИЯ ЕЭК ООН N 21/РЕД. 4, 04.05.2002) —
// официальный текст (Приложение 15 к Приказу ФТС России от 21.08.2007
// № 1003, публикация КонсультантПлюс). Коды взяты ИЗ ИСТОЧНИКА, не из
// памяти (карточка DF-17). Условия использования —
// docs/REFERENCES-SOURCES.md.
//
// ДАННЫЕ ДЛЯ СИДА (IC-16: единственный источник выбора — справочник в
// БД; файл импортирует ТОЛЬКО scripts/seed.ts). Включены 24 ходовых
// вида (карточка: «15–25 ходовых, остальные — по запросу»): добавить
// недостающее можно экраном справочника или здесь + пересид.
export const PACKAGING_ITEMS: { code: string; name: string; nameEn: string }[] = [
  { code: 'BG', name: 'Мешок', nameEn: 'Bag' },
  { code: 'FX', name: 'Мешок, гибкий контейнер (биг-бэг)', nameEn: 'Bag, flexible container' },
  { code: 'SA', name: 'Мешок (куль)', nameEn: 'Sack' },
  { code: 'BX', name: 'Коробка', nameEn: 'Box' },
  { code: 'CT', name: 'Коробка картонная', nameEn: 'Carton' },
  { code: 'CS', name: 'Ящик', nameEn: 'Case' },
  { code: 'CR', name: 'Ящик решетчатый (обрешетка)', nameEn: 'Crate' },
  { code: 'PX', name: 'Поддон (паллет)', nameEn: 'Pallet' },
  { code: 'PB', name: 'Поддон ящичный', nameEn: 'Pallet, box' },
  { code: 'CL', name: 'Бухта', nameEn: 'Coil' },
  { code: 'ST', name: 'Лист', nameEn: 'Sheet' },
  { code: 'DR', name: 'Барабан', nameEn: 'Drum' },
  { code: 'BA', name: 'Бочка (около 164 л)', nameEn: 'Barrel' },
  { code: 'CK', name: 'Бочка', nameEn: 'Cask' },
  { code: 'JC', name: 'Канистра прямоугольная', nameEn: 'Jerrican, rectangular' },
  { code: 'BL', name: 'Кипа спрессованная', nameEn: 'Bale, compressed' },
  { code: 'BN', name: 'Кипа неспрессованная', nameEn: 'Bale, non-compressed' },
  { code: 'BE', name: 'Пакет (пачка/связка)', nameEn: 'Bundle' },
  { code: 'PA', name: 'Пакет', nameEn: 'Packet' },
  { code: 'RO', name: 'Рулон', nameEn: 'Roll' },
  { code: 'NT', name: 'Сетка', nameEn: 'Net' },
  { code: 'TY', name: 'Цистерна цилиндрическая', nameEn: 'Tank, cylindrical' },
  { code: 'CN', name: 'Контейнер (транспортное оборудование)', nameEn: 'Container, n.o.s. as transport equipment' },
  { code: 'ZU', name: 'Контейнер средней грузоподъемности гибкий (IBC)', nameEn: 'Intermediate bulk container, flexible' },
]
