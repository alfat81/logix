#!/usr/bin/env python3
# DF-00B (шаг 10 карточки): тесты самих проверок.
# Для каждой IC — фикстура с заранее внесённым нарушением, которую проверка
# ОБЯЗАНА поймать, и чистый контрольный вариант, который ловиться не должен.
# Запуск: python3 scripts/test_integrity.py  (unittest, без внешних зависимостей)

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import integrity_check as ic  # noqa: E402
import scope  # noqa: E402


def touch(root: Path, relpath: str, content: str = "") -> Path:
    p = root / relpath
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return p


class FixtureBase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="logix-ic-"))
        ic.ROOT = self.tmp
        scope.ROOT = self.tmp
        scope.BASELINE = self.tmp / ".scope-baseline.json"
        scope.FROZEN = self.tmp / "docs" / "FROZEN.md"
        ic.VIOL.clear()

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def keys(self) -> set[str]:
        return {k for _, k, _ in ic.VIOL}


class TestIC02(FixtureBase):
    def test_catches_route_without_guard(self) -> None:
        touch(self.tmp, "src/app/api/admin/customers/route.ts", "export async function GET() {}")
        ic.ic02()
        self.assertIn("src/app/api/admin/customers/route.ts", self.keys())

    def test_route_with_guard_passes(self) -> None:
        touch(self.tmp, "src/app/api/admin/customers/route.ts",
              "import { requireEmployee } from '@/lib/auth'\nexport async function GET() {}")
        ic.ic02()
        self.assertEqual(self.keys(), set())


class TestIC03(FixtureBase):
    def test_catches_admin_write_without_event(self) -> None:
        touch(self.tmp, "src/app/api/admin/leads/route.ts",
              "export async function POST() { await requireEmployee(req, { write: true }) }")
        ic.ic03()
        self.assertIn("src/app/api/admin/leads/route.ts:event", self.keys())

    def test_catches_admin_write_without_flag(self) -> None:
        touch(self.tmp, "src/app/api/admin/leads/route.ts",
              "export async function POST() { db.activity.create({}) }")
        ic.ic03()
        self.assertIn("src/app/api/admin/leads/route.ts:write", self.keys())

    def test_roles_marker_form_passes_write_check(self) -> None:
        # master-only роуты (Ж6в, DF-00D): write: true в составе объекта с roles —
        # тот же маркер P1-09; регрессия подстрочного поиска (v0.6.1) не должна вернуться
        touch(self.tmp, "src/app/api/admin/employees/route.ts",
              "export async function POST() { const a = await requireEmployee(req, { write: true, roles: ['master'] }); await db.employee.create({}) }")
        ic.ic03()
        self.assertEqual([k for k in self.keys() if k.endswith(":write")], [])

    def test_no_event_marker_passes(self) -> None:
        touch(self.tmp, "src/app/api/admin/leads/route.ts",
              "// no-event: служебный сброс\nexport async function POST() { await requireEmployee(req, { write: true }) }")
        ic.ic03()
        self.assertEqual(self.keys(), set())


class TestIC04(FixtureBase):
    def test_catches_unregistered_event(self) -> None:
        touch(self.tmp, "src/lib/activity.ts",
              "export const ACTIVITY_TYPES = ['lead_created', 'order_created']")
        touch(self.tmp, "src/lib/other.ts", "const a = { type: 'mystery_event' }")
        ic.ic04()
        self.assertIn("not-in-registry:mystery_event", self.keys())

    def test_registered_type_used_passes(self) -> None:
        touch(self.tmp, "src/lib/activity.ts",
              "export const ACTIVITY_TYPES = ['lead_created']")
        touch(self.tmp, "src/app/api/x/route.ts", "createActivity('lead_created')")
        ic.ic04()
        self.assertEqual(self.keys(), set())


class TestIC05(FixtureBase):
    def test_catches_label_without_value(self) -> None:
        touch(self.tmp, "src/lib/leads.ts",
              "export type LeadStatus = 'new' | 'won'\n"
              "export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {\n  new: 'Новый',\n  ghost: 'Призрак',\n}")
        ic.ic05()
        self.assertIn("LEAD_STATUS_LABELS:ghost", self.keys())

    def test_catches_status_without_badge(self) -> None:
        touch(self.tmp, "src/lib/leads.ts",
              "export type LeadStatus = 'new' | 'won'\n"
              "export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {\n  new: 'Новый',\n  won: 'Выигран',\n}\n"
              "export const LEAD_BADGE_VARIANTS: Record<LeadStatus, StatusBadgeVariant> = {\n  new: 'pending',\n}")
        ic.ic05()
        self.assertIn("badge:LeadStatus:won", self.keys())


class TestIC06(FixtureBase):
    def test_catches_undocumented_env(self) -> None:
        name = "MY_" + "SECRET_VAR"  # конкатенация: сканер env не должен видеть литерал в этом файле
        touch(self.tmp, "src/lib/x.ts", f"const u = process.env.{name}")
        ic.ic06()
        self.assertIn(f"not-in-example:{name}", self.keys())

    def test_documented_env_passes(self) -> None:
        name = "DOC_" + "VAR"
        touch(self.tmp, "src/lib/x.ts", f"const u = process.env.{name}")
        touch(self.tmp, ".env.example", f'{name}="1"\n')
        touch(self.tmp, "DEPLOY.md", f"Используется {name} для чего-то")
        ic.ic06()
        self.assertEqual(self.keys(), set())


class TestIC09(FixtureBase):
    def test_catches_hex_outside_globals(self) -> None:
        touch(self.tmp, "src/components/x.tsx", "const c = '#FF8800'")
        ic.ic09()
        self.assertTrue(any(k.startswith("hex:") for k in self.keys()))

    def test_catches_oversize_file(self) -> None:
        touch(self.tmp, "src/components/big.tsx", "\n".join("// строка" for _ in range(301)))
        ic.ic09()
        self.assertIn("lines:src/components/big.tsx", self.keys())

    def test_money_to_locale_caught_but_date_not(self) -> None:
        touch(self.tmp, "src/components/a.tsx",
              "const m = n.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })")
        touch(self.tmp, "src/components/b.tsx",
              "const d = new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short' })")
        ic.ic09()
        self.assertIn("money:src/components/a.tsx", self.keys())
        self.assertNotIn("money:src/components/b.tsx", self.keys())


class TestIC10(FixtureBase):
    def test_catches_apex_and_lid(self) -> None:
        apex_word = "AP" + "EX"  # конкатенация: проверка не должна ловить сам тест-файл
        touch(self.tmp, "src/lib/legacy.ts", f"// Перенесено из {apex_word} Moto")
        touch(self.tmp, "src/components/y.tsx", "const s = 'конвертация лида'")
        ic.ic10()
        self.assertIn("apex:src/lib/legacy.ts", self.keys())
        self.assertIn("lid:src/components/y.tsx", self.keys())

    def test_lid_in_comment_passes(self) -> None:
        touch(self.tmp, "src/components/y.tsx", "// история термина «лид» (D27)")
        ic.ic10()
        self.assertEqual([k for k in self.keys() if k.startswith("lid:")], [])


class TestIC12(FixtureBase):
    def test_catches_bad_deprecations_format(self) -> None:
        touch(self.tmp, "scripts/inventory.py", "import sys; sys.exit(0)")
        touch(self.tmp, "docs/DEPRECATIONS.md", "| Что | Чем заменено |\n|---|---|\n| a | b |")
        ic.ic12()
        self.assertIn("deprecations-format", self.keys())

    def test_valid_deprecations_passes(self) -> None:
        touch(self.tmp, "scripts/inventory.py", "import sys; sys.exit(0)")
        touch(self.tmp, "docs/DEPRECATIONS.md",
              "| Что | Чем заменено | Почему оставлено | Версия удаления | Как проверить |\n"
              "|---|---|---|---|---|\n"
              "| X | Y | совместимость | 0.7.0 | rg -n X src |")
        ic.ic12()
        self.assertEqual([k for k in self.keys() if "deprecations" in k], [])


class TestIC14(FixtureBase):
    def test_catches_duplicate_export_names(self) -> None:
        touch(self.tmp, "src/lib/a.ts", "export function helper() {}")
        touch(self.tmp, "src/lib/b.ts", "export function helper() {}")
        ic.ic14()
        self.assertIn("export:helper", self.keys())

    def test_catches_duplicate_blocks(self) -> None:
        block = "\n".join(f"const line{i} = {i}" for i in range(12))
        touch(self.tmp, "src/lib/c.ts", block)
        touch(self.tmp, "src/lib/d.ts", block)
        ic.ic14()
        self.assertTrue(any(k.startswith("block:") for k in self.keys()))


class TestIC15(FixtureBase):
    FULL_ENTRY = (
        "export const SETTINGS = [\n"
        "  defineSetting({\n"
        "    key: 'files.max_mb', group: 'files', uiType: 'number',\n"
        "    label: 'Максимальный размер файла',\n"
        "    hint: 'Лимит загрузки',\n"
        "    defaultValue: 25, validate: (v) => asInt(v, 1, 200),\n"
        "  }),\n"
        "]\n")

    def test_catches_business_literals_outside_registry(self) -> None:
        touch(self.tmp, "src/lib/x.ts",
              "const w = '09:00'\nconst tz = 'Europe/Moscow'\nconst e = 'noreply@logix.ru'")
        ic.ic15()
        k = self.keys()
        self.assertTrue(any(s.startswith("time:") for s in k), k)
        self.assertTrue(any(s.startswith("tz:") for s in k), k)
        self.assertTrue(any(s.startswith("email:") for s in k), k)

    def test_format_examples_pass(self) -> None:
        touch(self.tmp, "src/components/p.tsx",
              "// дежурная подпись 09:00\n"
              "const iso = new Date(v + 'T00:00:00')\n"
              "export const P = () => <Input placeholder=\"09:00, 16:00\" />")
        touch(self.tmp, "src/components/q.tsx",
              "export const Q = () => <Input placeholder=\"mail@example.com\" />")
        ic.ic15()
        k = self.keys()
        self.assertEqual([s for s in k if s.startswith(("time:", "tz:", "email:"))], [], k)

    def test_registry_entry_requires_default_label_validate(self) -> None:
        touch(self.tmp, "src/lib/settings.ts",
              "export const SETTINGS = [\n"
              "  defineSetting({\n"
              "    key: 'files.max_mb', group: 'files', uiType: 'number',\n"
              "    label: 'Максимальный размер файла',\n"
              "    validate: (v) => asInt(v, 1, 200),\n"
              "  }),\n"
              "]\n")
        ic.ic15()
        self.assertIn("registry:default:files.max_mb", self.keys())

    def test_screen_must_not_hardcode_key(self) -> None:
        touch(self.tmp, "src/lib/settings.ts", self.FULL_ENTRY)
        touch(self.tmp, "src/app/api/admin/settings/route.ts",
              "import { SETTINGS } from '@/lib/settings'\nconst rows = SETTINGS.map((d) => d.key)")
        touch(self.tmp, "src/app/admin/(dashboard)/settings/page.tsx",
              "export default function Page() { return <SettingsPanel /> }")
        touch(self.tmp, "src/components/admin/SettingsPanel.tsx",
              "const keys = settings.map((entry) => entry.key)\nif (keys[0] === 'files.max_mb') {}")
        ic.ic15()
        self.assertIn("screen-hardcoded:files.max_mb", self.keys())

    def test_direct_setting_write_caught(self) -> None:
        touch(self.tmp, "src/app/api/admin/x/route.ts",
              "export async function PATCH() { await db.setting.upsert({}) }")
        ic.ic15()
        self.assertIn("direct-write:src/app/api/admin/x/route.ts", self.keys())

    def test_valid_configuration_passes(self) -> None:
        touch(self.tmp, "src/lib/activity.ts",
              "export const ACTIVITY_TYPES = ['lead_created', 'setting_changed']")
        touch(self.tmp, "src/lib/settings.ts",
              "import { emitEvent } from './events'\n" + self.FULL_ENTRY +
              "export async function setSetting(key: string, value: unknown, tx: unknown) {\n"
              "  await tx.setting.upsert({})\n"
              "  await emitEvent(tx, { type: 'setting_changed', description: key })\n"
              "}\n")
        touch(self.tmp, "src/app/api/admin/settings/route.ts",
              "import { SETTINGS } from '@/lib/settings'\nconst rows = SETTINGS.map((d) => d.key)")
        touch(self.tmp, "src/app/admin/(dashboard)/settings/page.tsx",
              "export default function Page() { return <SettingsPanel /> }")
        touch(self.tmp, "src/components/admin/SettingsPanel.tsx",
              "export function SettingsPanel() { return settings.map((entry) => entry.key) }")
        ic.ic15()
        self.assertEqual(self.keys(), set())


class TestScope(FixtureBase):
    def test_outside_globs_violates(self) -> None:
        touch(self.tmp, "src/keep.ts", "x")
        (self.tmp / ".scope-baseline.json").write_text(
            scope.json.dumps(scope.tree_hashes()), encoding="utf-8")
        touch(self.tmp, "src/lib/other.ts", "y")  # добавлен после снимка
        touch(self.tmp, "docs/releases/SCOPE-v9.9.9.json",
              scope.json.dumps({"task": "t", "globs": ["src/keep.ts"]}))
        rc = scope.cmd_check([])
        self.assertEqual(rc, 1)

    def test_inside_globs_passes(self) -> None:
        touch(self.tmp, "src/keep.ts", "x")
        (self.tmp / ".scope-baseline.json").write_text(
            scope.json.dumps(scope.tree_hashes()), encoding="utf-8")
        touch(self.tmp, "src/keep.ts", "y")  # изменён, но в глобах
        touch(self.tmp, "docs/releases/SCOPE-v9.9.9.json",
              scope.json.dumps({"task": "t", "globs": ["src/**", "docs/releases/**"]}))
        rc = scope.cmd_check([])
        self.assertEqual(rc, 0)


class TestInventoryDeterminism(FixtureBase):
    def test_regeneration_is_stable(self) -> None:
        touch(self.tmp, "package.json",
              '{"name": "fx", "version": "0.0.0", "scripts": {}}')
        touch(self.tmp, "src/lib/money.ts",
              "// форматирование денег (RULES 2.15)\nexport function formatRub(n: number): string { return '' }")
        import inventory
        inventory.ROOT = self.tmp
        inventory.OUT = self.tmp / "docs" / "INVENTORY.md"
        a = inventory.build_md()
        b = inventory.build_md()
        self.assertEqual(a, b)
        self.assertIn("`formatRub`", a)


if __name__ == "__main__":
    unittest.main(verbosity=2)
