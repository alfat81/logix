-- ─── DF-03: contract-релиз — удаление изжитых колонок ─────────────────
-- Реестр DEPRECATIONS (версия удаления 0.6.5): замены давно живут.
--   • Activity.isInternal      → Activity.audience (df_01_event_audience);
--     emitEvent пишет audience, читатели — eventWhereFor (lib/audience.ts)
--   • Customer.password        → CustomerUser.password (df_02a_company_users);
--     вход — authenticateCustomerLogin (hash основного пользователя)
--   • Broker.password          → BrokerUser.password (та же миграция);
--     вход — authenticateBrokerLogin; Broker.phone остаётся справочным
-- Страховка отката (хеши в старых колонках) пережила окно деплоя 0.6.4
-- и теперь удаляется по правилу «замена = удаление» (RULES 2.3).
ALTER TABLE "Activity" DROP COLUMN "isInternal";
ALTER TABLE "Customer" DROP COLUMN "password";
ALTER TABLE "Broker" DROP COLUMN "password";
