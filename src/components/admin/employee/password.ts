// v0.5.0 (P1-22): генератор стартового/нового пароля сотрудника —
// выезд из EmployeesList.tsx (резка под лимит 300, RULES 2.14).
// Видимый текст — мастер задаёт его, чтобы передать сотруднику лично
// (скрывать от того, кто его придумывает, бессмысленно). Алфавит без
// похожих символов (0/O, 1/l/I).
export function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}
