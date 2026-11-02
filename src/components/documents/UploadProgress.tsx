'use client'

// DF-11: индикатор прогресса двухфазной загрузки — один на все три
// диалога (документ, версия, разрешительный, IC-14). Токены брендбука:
// дорожка bg-muted, заливка bg-primary (Coral — основное действие), §3.1.
export function UploadProgress({ progress }: { progress: number }) {
  return (
    <div className="grid gap-1">
      <div
        className="h-1.5 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">Загрузка файла — {progress}%</p>
    </div>
  )
}
