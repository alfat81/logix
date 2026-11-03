'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDocSize } from '@/lib/document-constants'

// DF-13: фолбэк «Скачать финальные документы» — суммарный размер
// финальных версий выше порога ответа serverless-функции (карточка
// DF-13): вместо ZIP сервер отдаёт JSON-список ссылок на отдельные
// файлы с пояснением; скачивание — тот же авторизующий роут версий.

export type PackageFallbackUi = {
  files: Array<{ name: string; url: string; size: number }>
  totalBytes: number
  maxBytes: number
}

export function PackageZipFallbackDialog({
  data,
  onClose,
}: {
  data: PackageFallbackUi | null
  onClose: () => void
}) {
  return (
    <Dialog open={data !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Пакет слишком велик для одного архива</DialogTitle>
          <DialogDescription>
            Финальные документы весят {formatDocSize(data?.totalBytes ?? 0)} — больше
            предела {formatDocSize(data?.maxBytes ?? 0)} на ответ сервера. Скачайте файлы
            по одному — ссылки открываются с правами вашего кабинета.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto space-y-1.5">
          {(data?.files ?? []).map((f) => (
            <a
              key={f.url}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 text-sm border rounded-lg px-3 py-2 hover:bg-muted/50"
            >
              <span className="truncate" title={f.name}>
                {f.name}
              </span>
              <span className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                {formatDocSize(f.size)}
                <Download className="size-4" />
              </span>
            </a>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
