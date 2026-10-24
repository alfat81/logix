'use client'

import { Printer, X } from 'lucide-react'

// Тулбар печатной формы (Е): только экран, на печать не попадает
// (print.css: .toolbar { display: none } в @media print). Паттерн
// PrintLayout из APEX Moto — печать и закрытие вкладки.
// v0.3.1 (RULES 2.14): эмодзи 🖨/✕ заменены иконками lucide-react —
// RULES 2.14 запрещает эмодзи в интерфейсе; тексты и поведение 1:1.
export function OrderPrintToolbar({ label }: { label: string }) {
  return (
    <div className="toolbar">
      <button onClick={() => window.print()}>
        <Printer className="size-4" aria-hidden />
        Печать
      </button>
      <button className="secondary" onClick={() => window.close()}>
        <X className="size-4" aria-hidden />
        Закрыть
      </button>
      <span className="doc-type-label">{label}</span>
    </div>
  )
}
