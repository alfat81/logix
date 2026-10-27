-- DF-00D «Настройки системы: минимум хардкода» (D32, инвариант 9)
-- Одна новая таблица без ссылок на остальные (expand-безопасно: старый
-- код её не трогает, совместимость с v0.6.0 полная). Таблица остаётся
-- ПУСТОЙ при создании: getSetting откатывается на значения по умолчанию
-- из реестра SETTINGS (src/lib/settings.ts) — система работает и до
-- первого изменения владельцем. Свободные ключи не допускаются:
-- setSetting пишет только ключи реестра и прогоняет значение через
-- валидатор. Изменение дублируется событием setting_changed
-- (emitEvent, аудитория staff, старое/новое — без секретов).
-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByName" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);
