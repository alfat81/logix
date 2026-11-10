-- Поток A волна 2 (DF-25, план ред. 3 §5.1 + §2.6): миграция bl_phone_ops.
-- AUD-03: уникальность телефона пользователя компании — ГЛОБАЛЬНАЯ
-- (решение владельца А2, DECISIONS): вход ищет пользователя по телефону —
-- дубль делал findFirst недетерминированным; cross-409 в
-- lib/company-users.ts дополняется физическим уникальным индексом.
-- Postgres допускает любое число NULL в уникальном индексе — контакт
-- без входа (phone IS NULL) не ограничен. Частичный индекс не нужен.
-- Перед применением на живой базе — ОБЯЗАТЕЛЬНАЯ предпроверка дублей
-- (scripts/precheck_phone_dupes.sql, RELEASE-INSTRUCTIONS).

/*
  Warnings:
  - A unique constraint covering the columns `[phone]` on the table
    `CustomerUser` will be added. If there are existing duplicate values,
    this will fail.
*/

-- DropIndex
DROP INDEX "CustomerUser_phone_idx";

-- AlterTable
-- BL-8: заявка на смену телефона, ожидающая подтверждения кодом
-- (pendingPhone), хеш одноразового кода (детерминированный sha256 —
-- солевой scrypt несовместим с WHERE атомарного захвата), TTL кода
-- 15 минут, счётчик попыток (лимит 5).
ALTER TABLE "CustomerUser" ADD COLUMN     "pendingPhone" TEXT,
ADD COLUMN     "phoneCodeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "phoneCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "phoneCodeHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CustomerUser_phone_key" ON "CustomerUser"("phone");
