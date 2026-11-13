'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ClientLeadCreateDialog } from '@/components/client/ClientLeadCreateDialog'

// TU-01.7 (волна 3): кнопка «Новый запрос» в шапке кабинета (референс
// clientcabinet.png — терракотовая кнопка в топбаре). Диалог — тот же
// компонент в управляемом режиме; после создания — событие для
// ClientHome (обновить список запросов) без прокидывания колбэков
// через серверный layout.
export function ClientNewRequestButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="size-4" />
        {/* TU-01.9 @375: на узкой ширине — иконка с доступным именем,
            чтобы топбар не переполнялся. */}
        <span className="hidden sm:inline">Новый запрос</span>
        <span className="sr-only sm:hidden">Новый запрос</span>
      </Button>
      <ClientLeadCreateDialog
        onCreated={() => window.dispatchEvent(new CustomEvent('client:lead-created'))}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
