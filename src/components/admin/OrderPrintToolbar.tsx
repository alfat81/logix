'use client'

// Тулбар печатной формы (Е): только экран, на печать не попадает
// (print.css: .toolbar { display: none } в @media print). Паттерн
// PrintLayout из APEX Moto — печать и закрытие вкладки.

export function OrderPrintToolbar({ label }: { label: string }) {
  return (
    <div className="toolbar">
      <button onClick={() => window.print()}>🖨 Печать</button>
      <button className="secondary" onClick={() => window.close()}>
        ✕ Закрыть
      </button>
      <span className="doc-type-label">{label}</span>
    </div>
  )
}
