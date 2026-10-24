// Общий элемент показа «подпись + значение» (Ж-бланки): использовался
// локально в карточке лида и заявки — при резке монолитов (P1-19)
// вынесен в одно место, чтобы подписи не расходились.
export function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium break-words">{value}</span>
    </div>
  )
}
