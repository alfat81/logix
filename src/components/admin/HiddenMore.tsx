import Link from 'next/link'

// ─── «И ещё N — открыть список …» (общий хвост секций) ───────────────
// Хвост секций «Требует внимания» (Ж5) и «Пульса» (DF-07): срез
// отдаётся лимитом, счётчик полный — вот куда он ведёт. Один компонент
// вместо копий (IC-14: 12-строчные окна).
export function HiddenMore({
  hidden,
  href = '/admin/orders',
  label = 'открыть список заявок',
}: {
  hidden: number
  href?: string
  label?: string
}) {
  if (hidden <= 0) return null
  return (
    <div className="text-xs text-muted-foreground text-center pt-1">
      И ещё {hidden} —{' '}
      <Link href={href} className="underline underline-offset-2">
        {label}
      </Link>
    </div>
  )
}
