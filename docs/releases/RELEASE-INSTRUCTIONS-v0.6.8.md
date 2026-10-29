# Release Instructions — v0.6.8 (29.10.2026)

Выполняется на машине владельца (PowerShell). Архив: `logix-v0.6.8.zip`. Новых env нет. Миграции additive.

## 1. Синхронизация клона

```powershell
git fetch origin
git reset --hard origin/main
```

## 2. Распаковка архива

```powershell
Expand-Archive -Path .\logix-v0.6.8.zip -DestinationPath . -Force
```

## 3. Проверка версии

В `package.json` должно быть `"version": "0.6.8"`.

## 4. Проверка состава

```powershell
git status --short
```

Ожидаемый состав релиза относительно точки `cddc368` (предыдущий релиз, включая новые файлы):

```
M	.env.example
M	.github/workflows/ci.yml
M	.github/workflows/scheduler.yml
M	.gitignore
M	CHANGELOG.md
M	DEPLOY.md
M	README.md
M	bun.lock
A	df01-report.md
M	docs/BRANDBOOK.md
M	docs/DECISIONS.md
M	docs/DEPRECATIONS.md
M	docs/FROZEN.md
M	docs/INVENTORY.md
M	docs/REFERENCES-SOURCES.md
M	docs/ROADMAP-DEALFLOW.md
M	docs/ROADMAP.md
M	docs/RULES.md
M	docs/SECURITY-ACTIONS.md
M	docs/archive/LOGISTICS-ROADMAP-v2.0.md
M	docs/archive/releases/RELEASE-INSTRUCTIONS-v0.2.0.md
M	docs/archive/releases/RELEASE-INSTRUCTIONS-v0.2.1.md
M	docs/archive/releases/RELEASE-INSTRUCTIONS-v0.2.2.md
M	docs/archive/releases/RELEASE-INSTRUCTIONS-v0.2.3.md
M	docs/archive/releases/RELEASE-INSTRUCTIONS-v0.2.4.md
M	docs/archive/releases/RELEASE-INSTRUCTIONS-v0.2.5.md
M	docs/archive/releases/RELEASE-INSTRUCTIONS-v0.2.6.md
M	docs/archive/releases/RELEASE-INSTRUCTIONS-v0.2.7.md
M	docs/archive/releases/RELEASE-INSTRUCTIONS-v0.2.8.md
M	docs/archive/releases/RELEASE-INSTRUCTIONS-v0.2.9.md
M	docs/archive/releases/RELEASE-INSTRUCTIONS-v0.3.0.md
M	docs/archive/releases/RELEASE-INSTRUCTIONS-v0.3.1.md
M	docs/archive/releases/RELEASE-INSTRUCTIONS-v0.4.0.md
M	docs/archive/releases/RELEASE-INSTRUCTIONS-v0.4.1.md
M	docs/archive/releases/RELEASE-NOTES-v0.2.0.md
M	docs/archive/releases/RELEASE-NOTES-v0.2.1.md
M	docs/archive/releases/RELEASE-NOTES-v0.2.2.md
M	docs/archive/releases/RELEASE-NOTES-v0.2.3.md
M	docs/archive/releases/RELEASE-NOTES-v0.2.4.md
M	docs/archive/releases/RELEASE-NOTES-v0.2.5.md
M	docs/archive/releases/RELEASE-NOTES-v0.2.6.md
M	docs/archive/releases/RELEASE-NOTES-v0.2.7.md
M	docs/archive/releases/RELEASE-NOTES-v0.2.8.md
M	docs/archive/releases/RELEASE-NOTES-v0.2.9.md
M	docs/archive/releases/RELEASE-NOTES-v0.3.0.md
M	docs/archive/releases/RELEASE-NOTES-v0.3.1.md
M	docs/archive/releases/RELEASE-NOTES-v0.4.0.md
M	docs/archive/releases/RELEASE-NOTES-v0.4.1.md
M	docs/archive/worklog.md
M	docs/design/UXPILOT-BRIEF.md
M	docs/design/mockups/.gitkeep
M	docs/releases/RELEASE-INSTRUCTIONS-v0.5.0.md
M	docs/releases/RELEASE-INSTRUCTIONS-v0.5.1.md
M	docs/releases/RELEASE-INSTRUCTIONS-v0.5.2.md
M	docs/releases/RELEASE-INSTRUCTIONS-v0.5.3.md
M	docs/releases/RELEASE-INSTRUCTIONS-v0.5.4.md
M	docs/releases/RELEASE-INSTRUCTIONS-v0.5.5.md
M	docs/releases/RELEASE-INSTRUCTIONS-v0.6.0.md
M	docs/releases/RELEASE-INSTRUCTIONS-v0.6.1.md
M	docs/releases/RELEASE-INSTRUCTIONS-v0.6.2.md
M	docs/releases/RELEASE-INSTRUCTIONS-v0.6.3.md
M	docs/releases/RELEASE-INSTRUCTIONS-v0.6.4.md
M	docs/releases/RELEASE-INSTRUCTIONS-v0.6.5.md
M	docs/releases/RELEASE-INSTRUCTIONS-v0.6.6.md
M	docs/releases/RELEASE-INSTRUCTIONS-v0.6.7.md
M	docs/releases/RELEASE-NOTES-v0.5.0.md
M	docs/releases/RELEASE-NOTES-v0.5.1.md
M	docs/releases/RELEASE-NOTES-v0.5.2.md
M	docs/releases/RELEASE-NOTES-v0.5.3.md
M	docs/releases/RELEASE-NOTES-v0.5.4.md
M	docs/releases/RELEASE-NOTES-v0.5.5.md
M	docs/releases/RELEASE-NOTES-v0.6.0.md
M	docs/releases/RELEASE-NOTES-v0.6.1.md
M	docs/releases/RELEASE-NOTES-v0.6.2.md
M	docs/releases/RELEASE-NOTES-v0.6.3.md
M	docs/releases/RELEASE-NOTES-v0.6.4.md
M	docs/releases/RELEASE-NOTES-v0.6.5.md
M	docs/releases/RELEASE-NOTES-v0.6.6.md
M	docs/releases/RELEASE-NOTES-v0.6.7-fix1.md
A	docs/releases/RELEASE-NOTES-v0.6.7-fix2.md
M	docs/releases/RELEASE-NOTES-v0.6.7.md
M	docs/releases/SCOPE-v0.5.2.json
M	docs/releases/SCOPE-v0.5.3.json
M	docs/releases/SCOPE-v0.5.4.json
M	docs/releases/SCOPE-v0.5.5.json
M	docs/releases/SCOPE-v0.6.0.json
M	docs/releases/SCOPE-v0.6.1.json
M	docs/releases/SCOPE-v0.6.2.json
M	docs/releases/SCOPE-v0.6.3.json
M	docs/releases/SCOPE-v0.6.4.json
M	docs/releases/SCOPE-v0.6.5.json
M	docs/releases/SCOPE-v0.6.6.json
M	docs/releases/SCOPE-v0.6.7.json
A	download/BRANDBOOK.md
A	download/CHANGELOG.md
A	download/Logix-CHANGELOG.md
A	download/Logix-DECISIONS.md
A	download/Logix-RELEASE-INSTRUCTIONS-v0.2.3.md
A	download/Logix-RELEASE-INSTRUCTIONS-v0.2.4.md
A	download/Logix-RELEASE-INSTRUCTIONS-v0.2.5.md
A	download/Logix-RELEASE-INSTRUCTIONS-v0.2.6.md
A	download/Logix-RELEASE-NOTES-v0.2.3.md
A	download/Logix-RELEASE-NOTES-v0.2.4.md
A	download/Logix-RELEASE-NOTES-v0.2.5.md
A	download/Logix-RELEASE-NOTES-v0.2.6.md
A	"download/Logix-RULES-\320\276\320\261\320\275\320\276\320\262\320\273\321\221\320\275\320\275\321\213\320\271.md"
A	download/README.md
A	download/RELEASE-INSTRUCTIONS-v0.2.0.md
A	download/RELEASE-INSTRUCTIONS-v0.2.1.md
A	download/RELEASE-INSTRUCTIONS-v0.2.2.md
A	download/RELEASE-INSTRUCTIONS-v0.2.7.md
A	download/RELEASE-INSTRUCTIONS-v0.2.8.md
A	download/RELEASE-INSTRUCTIONS-v0.2.9.md
A	download/RELEASE-INSTRUCTIONS-v0.3.0.md
A	download/RELEASE-INSTRUCTIONS-v0.3.1.md
A	download/RELEASE-INSTRUCTIONS-v0.4.0.md
A	download/RELEASE-INSTRUCTIONS-v0.4.1.md
A	download/RELEASE-INSTRUCTIONS-v0.5.0.md
A	download/RELEASE-INSTRUCTIONS-v0.5.3.md
A	download/RELEASE-INSTRUCTIONS-v0.5.4.md
A	download/RELEASE-INSTRUCTIONS-v0.5.5.md
A	download/RELEASE-INSTRUCTIONS-v0.6.4.md
A	download/RELEASE-NOTES-v0.2.0.md
A	download/RELEASE-NOTES-v0.2.1.md
A	download/RELEASE-NOTES-v0.2.2.md
A	download/RELEASE-NOTES-v0.2.7.md
A	download/RELEASE-NOTES-v0.2.8.md
A	download/RELEASE-NOTES-v0.2.9.md
A	download/RELEASE-NOTES-v0.3.0.md
A	download/RELEASE-NOTES-v0.3.1.md
A	download/RELEASE-NOTES-v0.4.0.md
A	download/RELEASE-NOTES-v0.4.1.md
A	download/RELEASE-NOTES-v0.5.0.md
A	download/RELEASE-NOTES-v0.5.3.md
A	download/RELEASE-NOTES-v0.5.4.md
A	download/RELEASE-NOTES-v0.5.5.md
A	download/RELEASE-NOTES-v0.6.4.md
A	download/RELEASE-v0.6.4/RELEASE-INSTRUCTIONS-v0.6.4.md
A	download/RELEASE-v0.6.4/RELEASE-NOTES-v0.6.4.md
A	download/RELEASE-v0.6.4/SHA256SUMS.txt
A	download/RELEASE-v0.6.5/RELEASE-INSTRUCTIONS-v0.6.5.md
A	download/RELEASE-v0.6.5/RELEASE-NOTES-v0.6.5.md
A	download/RELEASE-v0.6.5/SHA256SUMS.txt
A	download/RELEASE-v0.6.6/RELEASE-INSTRUCTIONS-v0.6.6.md
A	download/RELEASE-v0.6.6/RELEASE-NOTES-v0.6.6.md
A	download/RELEASE-v0.6.6/SHA256SUMS.txt
A	download/RELEASE-v0.6.7-fix1/RELEASE-NOTES-v0.6.7-fix1.md
A	download/RELEASE-v0.6.7-fix1/SHA256SUMS.txt
A	download/RELEASE-v0.6.7-fix2/RELEASE-NOTES-v0.6.7-fix2.md
A	download/RELEASE-v0.6.7-fix2/SHA256SUMS.txt
A	download/RELEASE-v0.6.7-fix3/RELEASE-NOTES-v0.6.7-fix3.md
A	download/RELEASE-v0.6.7-fix3/SHA256SUMS.txt
A	download/RELEASE-v0.6.7-fix3/logix-v0.6.7-fix3.zip
A	download/RELEASE-v0.6.7/RELEASE-INSTRUCTIONS-v0.6.7.md
A	download/RELEASE-v0.6.7/RELEASE-NOTES-v0.6.7.md
A	download/RELEASE-v0.6.7/SHA256SUMS.txt
A	download/RULES-AUDIT-v0.4.0.md
A	download/RULES.md
A	download/ci-cron-secret-fix.patch
A	download/ci-email-provider-fix.patch
A	download/ci.yml
A	download/logix-v0.6.7-fix3.zip_
A	download/p1-07-df00c-contract-dialog.png
A	download/p1-07-df00c-landing-frozen.png
A	download/p1-07-df00c-pool-dialog.png
A	download/p1-18-home-1440.png
A	download/p1-19-lead-1440.png
A	download/p1-19-order-1440.png
A	download/p1-19-print.png
A	download/p1-20-home-1440.png
A	download/p1-20-orders-1440.png
A	download/p1-20-orders-375.png
A	download/p1-20-orders-v031-1440.png
A	download/p1-20-orders-v031-375.png
A	download/p1-20-print-v031.png
A	download/p1-20-print.png
A	download/p1-21-contracts-1440.png
A	download/p1-21-customers-1440.png
A	download/p1-21-lead-dialog-375.png
A	download/p1-21-leads-1440.png
A	download/p1-21-leads-375.png
A	download/p1-21-orders-1440.png
A	download/p1-22-brokers-1440.png
A	download/p1-22-brokers-375.png
A	download/p1-22-contractors-1440.png
A	download/p1-22-employees-1440.png
A	download/p1-22-employees-375.png
A	download/p1-22-legal-entities-1440.png
A	download/p1-22-order-docs-1440.png
A	download/p1-22-print-1440.png
A	download/p1-23-home-1440.png
A	download/p1-23-lead-card-1440.png
A	download/p1-23-lead-dialog-1440.png
A	download/p1-23-leads-1440.png
A	download/p1-23-leads-375.png
M	eslint.config.mjs
M	knip.json
M	metadata.json
M	next.config.ts
M	package.json
M	postcss.config.mjs
M	prisma/migrations/20261023000000_baseline/migration.sql
M	prisma/migrations/20261024113629_p1_01_responsible_manager/migration.sql
M	prisma/migrations/20261024133844_p1_03_route_fields/migration.sql
M	prisma/migrations/20261024170000_p1_04_money/migration.sql
M	prisma/migrations/20261026182707_df_01_event_audience/migration.sql
M	prisma/migrations/20261027094403_df_00d_settings/migration.sql
M	prisma/migrations/20261028042706_df_02a_company_users/migration.sql
M	prisma/migrations/20261028080900_df_02_contact_email/migration.sql
M	prisma/migrations/20261028092831_df_03_notifications/migration.sql
M	prisma/migrations/20261028100000_df_03_contract/migration.sql
M	prisma/migrations/20261028120000_df_17_references/migration.sql
M	prisma/migrations/20261028163218_df_17fix_refitem_default/migration.sql
A	prisma/migrations/20261028193326_df_17c_hs/migration.sql
A	prisma/migrations/20261029120000_df_18_broker_items/migration.sql
M	prisma/migrations/migration_lock.toml
M	prisma/schema.prisma
M	public/assets/aistudio/ROADMAP-DEALFLOW_50c77392.md
M	scripts/build-release.py
M	scripts/check-master-pass.mjs
A	scripts/d27_terminology.py
M	scripts/df00c_browser.sh
A	scripts/df02a_smoke5.py
M	scripts/e2e_api_test.py
M	scripts/e2e_contractor_frozen.py
M	scripts/e2e_seed_notification.ts
A	scripts/env-fallback.ts
A	scripts/fix_leadcard_aside.py
A	scripts/hs-source/ett-page.html
A	scripts/hs-source/group01.pdf
A	scripts/hs-source/group01.txt
A	scripts/hs-source/nsi-dictionaries.json
A	scripts/hs_make_snapshot.py
A	scripts/ic14_probe.py
A	scripts/import-hs.ts
M	scripts/integrity-baseline.json
M	scripts/integrity_check.py
M	scripts/inventory.py
M	scripts/knip-baseline.json
M	scripts/knip_check.py
A	scripts/make_fix1_zip.py
A	scripts/make_fix3_zip.py
A	scripts/p1_22_browser.sh
A	scripts/p1_22_emp_search.sh
A	scripts/p1_23_roadmap.py
A	scripts/provision_pg.sh
A	scripts/prune_baseline_df00d.py
M	scripts/q-db.mjs
M	scripts/ref-data/countries.ts
M	scripts/ref-data/currencies.ts
A	scripts/ref-data/hs/tnved-tws.json
M	scripts/ref-data/incoterms.ts
M	scripts/ref-data/packaging.ts
A	scripts/release_v068_docs.py
A	scripts/release_v068_pipeline.py
M	scripts/scope.py
A	scripts/scope_baseline_augment.py
M	scripts/scope_baseline_from_zip.py
M	scripts/seed.ts
M	scripts/set-master-password.ts
M	scripts/shadow-db.ts
A	scripts/slim_leadcard.py
M	scripts/test_integrity.py
A	scripts/verify_release_diff.py
A	scripts/verify_release_diff.sh
A	scripts/verify_v027_commit.py
M	src/app/admin/(dashboard)/brokers/page.tsx
M	src/app/admin/(dashboard)/contractors/ContractorsClient.tsx
M	src/app/admin/(dashboard)/contractors/page.tsx
M	src/app/admin/(dashboard)/contracts/page.tsx
M	src/app/admin/(dashboard)/customers/[id]/page.tsx
M	src/app/admin/(dashboard)/customers/page.tsx
M	src/app/admin/(dashboard)/employees/page.tsx
M	src/app/admin/(dashboard)/layout.tsx
M	src/app/admin/(dashboard)/leads/[id]/page.tsx
M	src/app/admin/(dashboard)/leads/page.tsx
M	src/app/admin/(dashboard)/legal-entities/page.tsx
M	src/app/admin/(dashboard)/notifications/page.tsx
M	src/app/admin/(dashboard)/orders/[id]/page.tsx
M	src/app/admin/(dashboard)/orders/page.tsx
M	src/app/admin/(dashboard)/page.tsx
M	src/app/admin/(dashboard)/references/page.tsx
M	src/app/admin/(dashboard)/settings/page.tsx
M	src/app/admin/(dashboard)/stage-catalog/page.tsx
M	src/app/admin/login/page.tsx
M	src/app/admin/orders/[id]/print/PrintTable.tsx
M	src/app/admin/orders/[id]/print/data.ts
M	src/app/admin/orders/[id]/print/page.tsx
M	src/app/admin/orders/[id]/print/print.css
M	src/app/api/admin/attention/route.ts
M	src/app/api/admin/brokers/[id]/route.ts
M	src/app/api/admin/brokers/[id]/users/route.ts
M	src/app/api/admin/brokers/route.ts
M	src/app/api/admin/contractor-leads/[id]/route.ts
M	src/app/api/admin/contractor-leads/route.ts
M	src/app/api/admin/contractors/[id]/route.ts
M	src/app/api/admin/contractors/route.ts
M	src/app/api/admin/contracts/route.ts
M	src/app/api/admin/customers/[id]/access/route.ts
M	src/app/api/admin/customers/[id]/route.ts
M	src/app/api/admin/customers/route.ts
M	src/app/api/admin/documents/[id]/route.ts
M	src/app/api/admin/documents/[id]/versions/route.ts
M	src/app/api/admin/employees/[id]/route.ts
M	src/app/api/admin/employees/route.ts
M	src/app/api/admin/leads/[id]/brokers/[brokerId]/route.ts
M	src/app/api/admin/leads/[id]/brokers/route.ts
M	src/app/api/admin/leads/[id]/convert/helpers.ts
M	src/app/api/admin/leads/[id]/convert/route.ts
M	src/app/api/admin/leads/[id]/documents/route.ts
M	src/app/api/admin/leads/[id]/notes/route.ts
M	src/app/api/admin/leads/[id]/options/route.ts
M	src/app/api/admin/leads/[id]/patch.ts
M	src/app/api/admin/leads/[id]/route.ts
M	src/app/api/admin/leads/route.ts
M	src/app/api/admin/legal-entities/[id]/route.ts
M	src/app/api/admin/legal-entities/route.ts
M	src/app/api/admin/notifications/[id]/retry/route.ts
M	src/app/api/admin/notifications/route.ts
M	src/app/api/admin/options/[id]/route.ts
M	src/app/api/admin/orders/[id]/brokers/[brokerId]/route.ts
M	src/app/api/admin/orders/[id]/brokers/route.ts
M	src/app/api/admin/orders/[id]/documents/route.ts
M	src/app/api/admin/orders/[id]/notes/route.ts
M	src/app/api/admin/orders/[id]/patch.ts
M	src/app/api/admin/orders/[id]/route.ts
M	src/app/api/admin/orders/[id]/schemas.ts
M	src/app/api/admin/orders/[id]/stages/[stageId]/route.ts
M	src/app/api/admin/orders/[id]/stages/route.ts
M	src/app/api/admin/orders/route.ts
M	src/app/api/admin/references/[id]/route.ts
M	src/app/api/admin/references/route.ts
M	src/app/api/admin/search/route.ts
M	src/app/api/admin/settings/route.ts
M	src/app/api/admin/stage-catalog/[id]/route.ts
M	src/app/api/admin/stage-catalog/route.ts
M	src/app/api/auth/broker/login/route.ts
M	src/app/api/auth/broker/logout/route.ts
M	src/app/api/auth/broker/me/route.ts
M	src/app/api/auth/client/login/route.ts
M	src/app/api/auth/client/logout/route.ts
M	src/app/api/auth/client/me/route.ts
M	src/app/api/auth/contractor/login/route.ts
M	src/app/api/auth/contractor/logout/route.ts
M	src/app/api/auth/contractor/me/route.ts
M	src/app/api/auth/employee/login/route.ts
M	src/app/api/auth/employee/logout/route.ts
M	src/app/api/auth/employee/me/route.ts
M	src/app/api/broker/documents/[id]/versions/route.ts
M	src/app/api/broker/leads/[id]/documents/route.ts
M	src/app/api/broker/leads/[id]/estimate/route.ts
M	src/app/api/broker/leads/[id]/route.ts
M	src/app/api/broker/leads/route.ts
M	src/app/api/broker/orders/[id]/documents/route.ts
M	src/app/api/broker/orders/[id]/route.ts
M	src/app/api/broker/orders/route.ts
M	src/app/api/client/documents/[id]/versions/route.ts
M	src/app/api/client/leads/[id]/documents/route.ts
M	src/app/api/client/leads/[id]/route.ts
M	src/app/api/client/leads/route.ts
M	src/app/api/client/orders/[id]/documents/route.ts
M	src/app/api/client/orders/[id]/route.ts
M	src/app/api/client/orders/route.ts
M	src/app/api/contractor/orders/[id]/route.ts
M	src/app/api/contractor/orders/[id]/stages/[stageId]/route.ts
M	src/app/api/contractor/orders/route.ts
M	src/app/api/document-versions/[id]/file/route.ts
M	src/app/api/health/route.ts
A	src/app/api/hs/search/route.ts
M	src/app/api/internal/notifications/dispatch/route.ts
M	src/app/api/ref/[dir]/route.ts
M	src/app/broker/(portal)/layout.tsx
M	src/app/broker/(portal)/leads/[id]/page.tsx
M	src/app/broker/(portal)/orders/[id]/page.tsx
M	src/app/broker/(portal)/page.tsx
M	src/app/broker/login/page.tsx
M	src/app/client/(portal)/layout.tsx
M	src/app/client/(portal)/leads/[id]/page.tsx
M	src/app/client/(portal)/orders/[id]/page.tsx
M	src/app/client/(portal)/page.tsx
M	src/app/client/login/page.tsx
M	src/app/contractor/(portal)/layout.tsx
M	src/app/contractor/(portal)/orders/[id]/page.tsx
M	src/app/contractor/(portal)/page.tsx
M	src/app/contractor/login/page.tsx
M	src/app/globals.css
M	src/app/layout.tsx
M	src/app/page.tsx
M	src/app/robots.ts
M	src/components/admin/ActivityFeed.tsx
M	src/components/admin/AdminNav.tsx
M	src/components/admin/AssigneeField.tsx
M	src/components/admin/AttentionScreen.tsx
M	src/components/admin/Breadcrumbs.tsx
M	src/components/admin/BrokerLinksSection.tsx
M	src/components/admin/BrokerUsersDialog.tsx
M	src/components/admin/BrokersList.tsx
M	src/components/admin/CargoGroups.tsx
M	src/components/admin/ContractorLeadsSection.tsx
M	src/components/admin/ContractorPoolSection.tsx
M	src/components/admin/ContractsList.tsx
M	src/components/admin/CustomerCabinetAccess.tsx
M	src/components/admin/CustomerCard.tsx
M	src/components/admin/CustomerCreateDialog.tsx
M	src/components/admin/CustomerUserDialog.tsx
M	src/components/admin/CustomersList.tsx
M	src/components/admin/EmployeesList.tsx
M	src/components/admin/GlobalSearch.tsx
M	src/components/admin/InfoField.tsx
M	src/components/admin/LeadCard.tsx
M	src/components/admin/LeadCreateDialog.tsx
M	src/components/admin/LeadEditDialog.tsx
M	src/components/admin/LeadListCard.tsx
M	src/components/admin/LeadStatusBadge.tsx
M	src/components/admin/LeadsList.tsx
M	src/components/admin/LeadsToolbar.tsx
M	src/components/admin/LegalEntitiesList.tsx
M	src/components/admin/ListTabs.tsx
M	src/components/admin/ListToolbar.tsx
M	src/components/admin/LogoutButton.tsx
M	src/components/admin/NoteForm.tsx
M	src/components/admin/NotificationsJournal.tsx
M	src/components/admin/OrderCard.tsx
M	src/components/admin/OrderCreateDialog.tsx
M	src/components/admin/OrderPrintToolbar.tsx
M	src/components/admin/OrderStatusBadge.tsx
M	src/components/admin/OrderStepper.tsx
M	src/components/admin/OrdersList.tsx
M	src/components/admin/OrdersToolbar.tsx
M	src/components/admin/QuoteOptionDialog.tsx
M	src/components/admin/QuoteOptionFormFields.tsx
M	src/components/admin/QuoteOptionsSection.tsx
M	src/components/admin/SettingsPanel.tsx
M	src/components/admin/SideActivityFeed.tsx
M	src/components/admin/StageCatalogList.tsx
M	src/components/admin/attention/AttentionSections.tsx
M	src/components/admin/attention/types.ts
M	src/components/admin/broker/BrokerCard.tsx
M	src/components/admin/broker/BrokerCreateDialog.tsx
M	src/components/admin/broker/BrokerEditDialog.tsx
M	src/components/admin/broker/BrokerFormFields.tsx
M	src/components/admin/broker/BrokerUserForm.tsx
M	src/components/admin/broker/types.ts
M	src/components/admin/cargo/CargoFormFields.tsx
M	src/components/admin/cargo/CargoGroupsView.tsx
M	src/components/admin/contractorlead/ContractorLeadActionsDialog.tsx
M	src/components/admin/contractorlead/ContractorLeadContractDialog.tsx
M	src/components/admin/contractorlead/ContractorLeadCreateDialog.tsx
M	src/components/admin/contractorlead/ContractorLeadStatusBadge.tsx
M	src/components/admin/contractorlead/RawInfoView.tsx
M	src/components/admin/contractorlead/TransportChips.tsx
M	src/components/admin/contractorlead/types.ts
M	src/components/admin/contractorpool/ContractorPoolEditDialog.tsx
M	src/components/admin/contractorpool/ContractorPoolToggleDialog.tsx
M	src/components/admin/contractorpool/types.ts
M	src/components/admin/employee/EmployeeCard.tsx
M	src/components/admin/employee/EmployeeCreateDialog.tsx
M	src/components/admin/employee/EmployeeEditDialog.tsx
M	src/components/admin/employee/EmployeeResetPasswordDialog.tsx
M	src/components/admin/employee/RoleChips.tsx
M	src/components/admin/employee/password.ts
M	src/components/admin/employee/types.ts
A	src/components/admin/estimate/EstimateView.tsx
M	src/components/admin/lead/LeadAnketaCard.tsx
M	src/components/admin/lead/LeadConvertBlock.tsx
M	src/components/admin/lead/LeadStatusControls.tsx
M	src/components/admin/lead/types.ts
M	src/components/admin/legalentity/LegalEntityCard.tsx
M	src/components/admin/legalentity/LegalEntityCreateDialog.tsx
M	src/components/admin/legalentity/LegalEntityEditDialog.tsx
M	src/components/admin/legalentity/RequisitesFields.tsx
M	src/components/admin/legalentity/types.ts
M	src/components/admin/order/OrderCargoCard.tsx
M	src/components/admin/order/OrderQuoteCard.tsx
M	src/components/admin/order/OrderQuoteDialog.tsx
M	src/components/admin/order/OrderStages.tsx
M	src/components/admin/order/StageCard.tsx
M	src/components/admin/order/quote-snapshot.ts
M	src/components/admin/order/types.ts
M	src/components/admin/references/RefDialog.tsx
M	src/components/admin/references/ReferencesScreen.tsx
M	src/components/admin/references/ref-types.ts
M	src/components/admin/stagecatalog/StageCreateDialog.tsx
M	src/components/admin/stagecatalog/StageEditDialog.tsx
M	src/components/admin/stagecatalog/types.ts
M	src/components/broker/BrokerBadges.tsx
M	src/components/broker/BrokerEstimateForm.tsx
M	src/components/broker/BrokerHome.tsx
M	src/components/broker/BrokerLeadCard.tsx
M	src/components/broker/BrokerLogoutButton.tsx
M	src/components/broker/BrokerOrderCard.tsx
A	src/components/broker/estimate/FormBlocks.tsx
A	src/components/broker/estimate/ItemsEditor.tsx
M	src/components/client/ClientBadges.tsx
M	src/components/client/ClientHome.tsx
M	src/components/client/ClientLeadCard.tsx
M	src/components/client/ClientLeadCreateDialog.tsx
M	src/components/client/ClientLogoutButton.tsx
M	src/components/client/ClientOrderCard.tsx
M	src/components/contractor/ContractorLogoutButton.tsx
M	src/components/contractor/ContractorOrderCard.tsx
M	src/components/contractor/ContractorOrdersList.tsx
M	src/components/documents/DocumentsSection.tsx
M	src/components/documents/parts/DocumentCreateDialog.tsx
M	src/components/documents/parts/DocumentVersionDialog.tsx
M	src/components/documents/parts/types.ts
A	src/components/references/ComboOptionRow.tsx
A	src/components/references/HsCodeCombobox.tsx
M	src/components/references/IncotermPicker.tsx
M	src/components/references/ReferenceCombobox.tsx
M	src/components/ui/badge.tsx
M	src/components/ui/button.tsx
M	src/components/ui/card.tsx
M	src/components/ui/dialog.tsx
M	src/components/ui/input.tsx
M	src/components/ui/label.tsx
M	src/components/ui/select.tsx
M	src/components/ui/textarea.tsx
M	src/components/ui/toast.tsx
M	src/components/ui/toaster.tsx
M	src/hooks/use-debounced-value.ts
M	src/hooks/use-paged-list.ts
M	src/hooks/use-toast.ts
M	src/lib/activity.ts
M	src/lib/actor-name.test.ts
M	src/lib/actor-name.ts
M	src/lib/api-client.ts
M	src/lib/api-errors.ts
M	src/lib/audience.test.ts
M	src/lib/audience.ts
M	src/lib/auth.ts
M	src/lib/brand.ts
M	src/lib/broker-auth.ts
M	src/lib/broker-links.ts
A	src/lib/brokers.test.ts
M	src/lib/brokers.ts
M	src/lib/cbr.test.ts
M	src/lib/cbr.ts
M	src/lib/client-auth.ts
M	src/lib/client-constants.ts
M	src/lib/company-users.test.ts
M	src/lib/company-users.ts
M	src/lib/contractor-auth.ts
M	src/lib/contractors.ts
M	src/lib/convert-atomic.test.ts
M	src/lib/db.ts
M	src/lib/document-constants.ts
M	src/lib/documents.ts
M	src/lib/employees.ts
M	src/lib/event-registry.ts
M	src/lib/events-guard.test.ts
M	src/lib/events.test.ts
M	src/lib/events.ts
M	src/lib/file-signature.ts
M	src/lib/flags.ts
A	src/lib/hs-db.ts
A	src/lib/hs.test.ts
A	src/lib/hs.ts
M	src/lib/lead-edit.ts
M	src/lib/leads.ts
M	src/lib/list-query.ts
M	src/lib/login-guard.ts
M	src/lib/money.test.ts
M	src/lib/money.ts
M	src/lib/note-constants.ts
M	src/lib/notifications/channel.ts
M	src/lib/notifications/digest.ts
M	src/lib/notifications/dispatch.ts
M	src/lib/notifications/enqueue.ts
M	src/lib/notifications/mask.test.ts
M	src/lib/notifications/mask.ts
M	src/lib/notifications/notifications.test.ts
M	src/lib/notifications/retry.test.ts
M	src/lib/notifications/retry.ts
M	src/lib/notifications/rules.ts
M	src/lib/notifications/templates.ts
M	src/lib/notifications/transport.ts
M	src/lib/notifications/transports/email.ts
M	src/lib/notifications/transports/fake.ts
M	src/lib/notifications/transports/telegram.ts
M	src/lib/notifications/transports/whatsapp.ts
M	src/lib/notifications/windows.ts
M	src/lib/order-constants.ts
M	src/lib/order-summary.ts
M	src/lib/orders.test.ts
M	src/lib/orders.ts
M	src/lib/participants.test.ts
M	src/lib/participants.ts
M	src/lib/password.test.ts
M	src/lib/password.ts
M	src/lib/permissions-guard.test.ts
M	src/lib/phone.ts
M	src/lib/portal-auth.ts
M	src/lib/ref-db.ts
M	src/lib/ref.test.ts
M	src/lib/ref.ts
M	src/lib/requisite-fields.ts
M	src/lib/route-fields.ts
M	src/lib/search-constants.ts
M	src/lib/settings-validators.ts
M	src/lib/settings.test.ts
M	src/lib/settings.ts
M	src/lib/stage-visuals.ts
M	src/lib/status-badges.ts
M	src/lib/status-machine.test.ts
M	src/lib/status-machine.ts
M	src/lib/utils.ts
M	src/proxy.ts
M	tests/setup-env.ts
M	tsconfig.json
A	upload/Pasted Content_1793171045984.txt
A	upload/pasted_image_1793176923808.png
A	upload/pasted_image_1793177557170.png
A	upload/pasted_image_1793210512257.png
A	upload/pasted_image_1793211508179.png
A	upload/pasted_image_1793211520871.png
A	upload/pasted_image_1793211648050.png
A	upload/pasted_image_1793212132432.png
A	upload/pasted_image_1793212162829.png
A	upload/pasted_image_1793262721393.png
A	upload/pasted_image_1793278949282.png
M	vercel.json
M	vitest.config.ts
A	worklog.md
??	docs/releases/RELEASE-NOTES-v0.6.8.md
??	scripts/release_v068_all.py
??	test-results/.last-run.json
??	docs/releases/RELEASE-INSTRUCTIONS-v0.6.8.md
```

## 5. Коммит и push

```powershell
git add -A
git commit -m "release v0.6.8: DF-17C справочник ТН ВЭД (tws.by, 13294 позиции, ред. 2022-2023) + DF-18 ответ брокера кодами и процентами (D38); миграции df_17c_hs + df_18_broker_items (additive); /api/hs/search + HsCodeCombobox (подсказка ЕТТ не автоподстановка); BrokerEstimateForm items+send, серверная верификация кодов, broker.max_items; vitest 241/241, e2e 311/311, tsc/lint/build/integrity/knip чисто"
git push origin main
```

## 6. CI

Дождаться зелёного CI на GitHub. Откат кода при проблемах:

```powershell
git revert HEAD --no-edit
git push origin main
```

## 7. Vercel

Деплой выполняется автоматически после push. Redeploy не требуется. Новых переменных окружения нет.

## 8. Миграции БД (Neon)

Перед шагом поставить точку восстановления Neon (страховка), затем:

```powershell
npx prisma@6 migrate deploy
```

Ожидаются миграции: `20261028193326_df_17c_hs`, `20261029120000_df_18_broker_items`.

## 9. Импорт ТН ВЭД

Строго после шага 8:

```powershell
npx tsx scripts/import-hs.ts
```

Ожидаемый вывод: «13294 позиций». Повторный запуск — no-op (редакция не менялась).

## 10. Смоук (8 пунктов)

1. Комбобокс ТН ВЭД: ввод `010121` → код найден, видна подсказка ЕТТ (справочно, ставка не подставляется).
2. Поиск по названию: «коров» → «коровы».
3. Брокер: черновик оценки → отправка.
4. Менеджеру пришло уведомление с diff.
5. Ручной код (ровно 10 цифр) → позиция «Код не из справочника», сервер перепроверил.
6. Дубли кодов в одной отправке → 400.
7. `customsDutyEstimate` = «итого, ₽» пересчитывается.
8. `/api/health` → 200.

## Откат

Код — `git revert` (шаг 6). Миграции additive не откатываются и не мешают работе предыдущей версии. Импортированный справочник остаётся в БД и на предыдущую версию не влияет.
