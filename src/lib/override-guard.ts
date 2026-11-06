// ─── Единый гард перекрытия (P1-05 → DF-14, G1: одна реализация) ─────
// Обход защит завершения — всегда осознанный: только мастер, только с
// комментарием, который попадает в журнал сделки. Лестница 403/400
// общая для двух точек применения:
//   • PATCH /api/admin/orders/[id] — завершение заявки с незавершёнными
//     обязательными этапами (P1-05);
//   • PATCH /api/admin/orders/[id]/stages/[stageId] — завершение этапа
//     с недостающими финальными документами чек-листа (DF-14).
// Ответ 409 (конкретная причина) остаётся на вызывающей стороне — у
// каждой точки свой текст и полезная нагрузка.

export type OverrideGuardInput = {
  override?: boolean
  overrideComment?: string
  isMaster: boolean
}

export type OverrideDenial = { status: 400 | 403; error: string }

/** null — перекрытие разрешено (или не запрашивалось); иначе отказ. */
export function assertOverridePermission(opts: OverrideGuardInput): OverrideDenial | null {
  if (opts.override && !opts.isMaster) {
    return { status: 403, error: 'Перекрытие завершения доступно только мастеру' }
  }
  if (opts.override && !opts.overrideComment) {
    return {
      status: 400,
      error: 'Укажите комментарий перекрытия (overrideComment) — он попадёт в журнал заявки',
    }
  }
  return null
}
