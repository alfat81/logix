// PATCH /api/admin/leads/[id] — логика вынесена в lib/lead-patch.ts
// (прецедент option-write: «роуты тонкие», RULES 2.5/2.14; DF-27 волна 2:
// автомат needs_data, Р-1 — атомарный сброс согласования и флаг
// актуализации всем вариантам). Вызов — PATCH в route.ts.
export { patchLead } from '@/lib/lead-patch'
