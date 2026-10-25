'use client'

// ─── Анкета груза: показ и форма (Ж1) ──────────────────────────────
// v0.5.0 (P1-22): файл разделён на cargo/CargoGroupsView.tsx (показ
// групп бланка) и cargo/CargoFormFields.tsx (поля формы) — резка под
// лимит 300 строк (RULES 2.14). Этот путь оставлен бочкой: 9 файлов
// импортируют отсюда, дифф хирургический.
export { CargoGroups, type RouteView } from './cargo/CargoGroupsView'
export { CargoFormFields } from './cargo/CargoFormFields'
