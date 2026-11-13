/* TU-01.4 — единое сообщение валидации поля (каталог TU-01.2 §4).
   role="alert" + текст токена destructive; подключается через
   aria-describedby инпута (id обязателен). text-xs = 12px — минимум
   по проверке мелкого текста (IC-17, часть 2). */
export function FieldError({
  id,
  message,
  className = "",
}: {
  id: string;
  message: string;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p role="alert" id={id} className={`mt-1 text-xs text-danger ${className}`}>
      {message}
    </p>
  );
}
