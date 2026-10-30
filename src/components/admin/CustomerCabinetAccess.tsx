'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, ShieldCheck, ShieldOff, Users, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { CustomerUserDialog, type CustomerUserRow } from './CustomerUserDialog'

// ─── Сотрудники клиента (И1 → DF-02A Блок 5) ────────────────────────
// Прежний диалог «один пароль на компанию» стал списком людей: менеджер
// создаёт сотрудников, выдаёт каждому пароль (вход = телефон человека),
// правит и деактивирует. Деактивация закрывает сессии только этого
// человека (роут access + lib/company-users.ts). Основной пользователь
// — перенос старого входа компании: деактивации не подлежит (доступ
// компании целиком закрывается деактивацией компании в справочнике).
// Хеши наружу не отдаются никогда — только hasPassword.

export function CustomerCabinetAccess({
  customerId,
  onChanged,
}: {
  customerId: string
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [users, setUsers] = useState<CustomerUserRow[] | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerUserRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/access`)
      const data = await readApiResponse<{ users?: CustomerUserRow[]; error?: string }>(res)
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
  }, [customerId, toast])

  useEffect(() => {
    load()
  }, [load])

  // После любой операции: перезагрузить список + карточку (бейдж
  // «доступ выдан» считается по людям на сервере).
  const reloadAll = () => {
    load()
    onChanged()
  }

  const toggleActive = async (u: CustomerUserRow) => {
    setBusyId(u.id)
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, isActive: !u.isActive }),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось изменить статус')
      toast({ title: u.isActive ? 'Доступ сотрудника закрыт' : 'Доступ сотрудника возвращён' })
      reloadAll()
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
    <Card className="p-0">
      <CardContent className="p-4 grid gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Users className="size-4 text-muted-foreground" />
          <div className="min-w-44 flex-1">
            <div className="text-sm font-medium">Сотрудники клиента</div>
            <div className="text-xs text-muted-foreground">
              Вход в кабинет — по телефону и паролю человека. Свои заявки видят все сотрудники
              компании.
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <UserPlus className="size-4" />
            Добавить сотрудника
          </Button>
        </div>

        {users === null ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
            <Loader2 className="size-4 animate-spin" />
            Загрузка…
          </div>
        ) : users.length === 0 ? (
          <div className="text-sm text-muted-foreground border-t pt-3">
            Сотрудников нет — добавьте первого, чтобы выдать доступ в кабинет.
          </div>
        ) : (
          <div className="grid gap-2 border-t pt-3">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3"
              >
                <div className="min-w-40 flex-1">
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
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => {
                      setEditing(u)
                      setDialogOpen(true)
                    }}
                    title="Править сотрудника"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  {!u.isPrimary && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={busyId === u.id}
                      onClick={() => toggleActive(u)}
                      title={
                        u.isActive
                          ? 'Закрыть доступ — активные сеансы сотрудника завершатся'
                          : 'Вернуть доступ'
                      }
                    >
                      {u.isActive ? (
                        <ShieldOff className="size-4 text-destructive" />
                      ) : (
                        <ShieldCheck className="size-4" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CustomerUserDialog
        customerId={customerId}
        user={editing}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={reloadAll}
      />
    </Card>
  )
}
