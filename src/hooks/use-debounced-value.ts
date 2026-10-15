'use client'

import { useEffect, useState } from 'react'

// Дебаунс значения для строки поиска (Ж4): печатающий пользователь не
// должен дёргать API на каждый символ — шлём запрос через паузу.
// Паттерн эталонного списка: q в состоянии живёт «сырой», в запрос
// уходит useDebouncedValue(q, 400).
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])

  return debounced
}
