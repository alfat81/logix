'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, ShieldCheck, ShieldOff, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { BrokerUserForm, type BrokerUserRow } from './broker/BrokerUserForm'
import type { BrokerRow } from './broker/types'

// ─── Сотрудники брокера (DF-02A Блок 5) ──────────────────────────────
// Список людей брокерской компании в справочнике: зеркально клиентскому
// списку (CustomerCabinetAccess). Вход в портал — телефон + пароль
// ЧЕЛОВЕКА; основной пользователь — перенос старого входа компании
// (деактивации не подлежит). Создание/правка — BrokerUserForm (лимит
// 300, RULES 2.14).

export function BrokerUsersDialog({
  broker,
  onClose,
}: {
  // null — диалог закрыт
  broker: BrokerRow | null
  onClose: () => void
}) {
  const { toast } = useToast()
  const [users, setUsers] = useState<BrokerUserRow[] | null>(null)
  const [editing, setEditing] = useState<BrokerUserRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const brokerId = broker?.id ?? ''

  const load = useCallback(async () => {
    if (!brokerId) return
    try {
      const res = await fetch(`/api/admin/brokers/${brokerId}/users`)
      const data = await readApiResponse<{ users?: BrokerUserRow[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setUsers(data.users ?? [])
    } catch (e) {
      setUsers([])
      toast({
        title: 'Не удалось загрузить список сотрудников',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    }
  }, [brokerId, toast])

  useEffect(() => {
    if (brokerId) {
      setUsers(null)
      setCreating(false)
      setEditing(null)
      load()
    }
  }, [brokerId, load])

  const patch = async (
    userId: string,
    body: { isActive?: boolean; password?: null },
    okTitle: string
  ) => {
    setBusyId(userId)
    try {
      const res = await fetch(`/api/admin/brokers/${brokerId}/users`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...body }),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось выполнить')
      toast({ title: okTitle })
      load()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={broker !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Сотрудники — {broker?.companyName}</DialogTitle>
          <DialogDescription>
            Вход в портал — по телефону и паролю человека. Смена/снятие пароля и закрытие
            доступа завершают активные сеансы этого человека.
          </DialogDescription>
        </DialogHeader>

        {users === null ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="size-4 animate-spin" />
            Загрузка…
          </div>
        ) : (
          <div className="grid gap-2 max-h-80 overflow-y-auto">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3"
              >
                <div className="min-w-36 flex-1">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <span className="truncate">{u.name}</span>
                    {u.isPrimary && <Badge variant="delivered">Основной</Badge>}
                    {!u.isActive && (
                      <Badge
                        variant="outline"
                        className="text-xs bg-destructive/10 text-destructive border-transparent"
                      >
                        Доступ закрыт
                      </Badge>
                    )}
                    {u.isActive && !u.hasPassword && <Badge variant="version">Без входа</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {u.phone ?? 'телефон не указан'}
                    {u.email && <span className="font-sans"> · {u.email}</span>}
                  </div>
                </div>
                {editing?.id === u.id || creating ? null : (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => {
                        setCreating(false)
                        setEditing(u)
                      }}
                      title="Править сотрудника"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    {u.hasPassword && !u.isPrimary && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-destructive hover:text-destructive"
                        disabled={busyId === u.id}
                        onClick={() => patch(u.id, { password: null }, 'Пароль снят — вход этому сотруднику закрыт')}
                        title="Снять пароль — вход закрыт"
                      >
                        Снять пароль
                      </Button>
                    )}
                    {!u.isPrimary && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={busyId === u.id}
                        onClick={() =>
                          patch(
                            u.id,
                            { isActive: !u.isActive },
                            u.isActive ? 'Доступ сотрудника закрыт' : 'Доступ сотрудника возвращён'
                          )
                        }
                        title={u.isActive ? 'Закрыть доступ' : 'Вернуть доступ'}
                      >
                        {u.isActive ? (
                          <ShieldOff className="size-4 text-destructive" />
                        ) : (
                          <ShieldCheck className="size-4" />
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {creating || editing !== null ? (
          <BrokerUserForm
            brokerId={brokerId}
            user={editing}
            onDone={() => {
              setCreating(false)
              setEditing(null)
              load()
            }}
            onCancel={() => {
              setCreating(false)
              setEditing(null)
            }}
          />
        ) : (
          <Button variant="outline" onClick={() => setCreating(true)} disabled={broker === null}>
            <UserPlus className="size-4" />
            Добавить сотрудника
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
