import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// §4.5 (DF-21): на телефоне (md:hidden) лист деталей начинается кнопкой
// «Назад»; на md+ путь показывает Ж7-крошки. Выезд из page.tsx заявки
// (RULES 2.14) — переиспользуется и карточкой клиента при реестре.
export function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="md:hidden inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Назад
    </Link>
  )
}
