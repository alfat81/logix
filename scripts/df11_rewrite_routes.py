#!/usr/bin/env python3
"""DF-11: переписывание роутов документооборота на двухфазную загрузку.
Каждая замена обязана примениться ровно один раз — иначе скрипт падает."""
from pathlib import Path
import sys

ROOT = Path('/home/z/my-project/src/app')

def sub(path: str, old: str, new: str, count: int = 1):
    p = ROOT / path if path.startswith('api/') else Path(path)
    s = p.read_text(encoding='utf-8')
    if s.count(old) != count:
        sys.exit(f'FAIL {p}: якорь встречается {s.count(old)} раз (ожидалось {count}):\n---\n{old[:200]}\n---')
    p.write_text(s.replace(old, new), encoding='utf-8')
    print(f'OK {p}')

VALID_BODY = '''    const body = await readJsonBody(req)
    const parsed = %SCHEMA%.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
'''

CREATE_ADMIN_ORDERS = '''    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    const document = await createDocumentOnDeal(
      { orderId: id },
      employeeActor(auth.employee),
      parsed.meta,
      parsed.file
    )
    return NextResponse.json({ document }, { status: 201 })'''

CREATE_ADMIN_ORDERS_NEW = '''    // DF-11: шаг 1 — pending-запись и presigned PUT; байты грузит браузер
    // напрямую в хранилище, confirm проверит размер и сигнатуру.
    const result = await createPendingDocument(
      { orderId: id },
      employeeActor(auth.employee),
      parsed.data
    )
    return NextResponse.json(result, { status: 201 })'''

CREATE_CLIENT_ORDERS = '''    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    const document = await createDocumentOnDeal(
      { orderId: id },
      clientActor(auth.client),
      parsed.meta,
      parsed.file
    )
    // DF-02A (Блок 4): автор версии 1 — этот пользователь; в ответе
    // сразу имя человека (свой кабинет — коллега).
    const [projected] = await projectDocumentAuthors([document], {
      kind: 'client',
      customerId: auth.client.id,
    })
    return NextResponse.json({ document: projected }, { status: 201 })'''

CREATE_CLIENT_ORDERS_NEW = '''    // DF-11: шаг 1 — pending-запись и presigned PUT (байты грузит браузер).
    // Клиент не может создать внутренний документ: createPendingDocument
    // принудительно гасит isInternal для не-сотрудников.
    const result = await createPendingDocument(
      { orderId: id },
      clientActor(auth.client),
      parsed.data
    )
    // DF-02A (Блок 4): автор версии 1 — этот пользователь; в ответе
    // сразу имя человека (свой кабинет — коллега).
    const [document] = await projectDocumentAuthors([result.document], {
      kind: 'client',
      customerId: auth.client.id,
    })
    return NextResponse.json({ ...result, document }, { status: 201 })'''

CREATE_BROKER_ORDERS = '''    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    const document = await createDocumentOnDeal(
      { orderId: id },
      brokerActor(auth.broker),
      parsed.meta,
      parsed.file
    )
    // DF-02A (Блок 4): автор версии 1 — этот пользователь; в ответе
    // сразу имя человека (свой кабинет — коллега).
    const [projected] = await projectDocumentAuthors([document], {
      kind: 'broker',
      brokerId: auth.broker.id,
    })
    return NextResponse.json({ document: projected }, { status: 201 })'''

CREATE_BROKER_ORDERS_NEW = '''    // DF-11: шаг 1 — pending-запись и presigned PUT (байты грузит браузер).
    const result = await createPendingDocument(
      { orderId: id },
      brokerActor(auth.broker),
      parsed.data
    )
    // DF-02A (Блок 4): автор версии 1 — этот пользователь; в ответе
    // сразу имя человека (свой кабинет — коллега).
    const [document] = await projectDocumentAuthors([result.document], {
      kind: 'broker',
      brokerId: auth.broker.id,
    })
    return NextResponse.json({ ...result, document }, { status: 201 })'''

CREATE_ADMIN_LEADS = '''    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    const document = await createDocumentOnDeal(
      { leadId: id },
      employeeActor(auth.employee),
      parsed.meta,
      parsed.file
    )
    return NextResponse.json({ document }, { status: 201 })'''

CREATE_ADMIN_LEADS_NEW = '''    // DF-11: шаг 1 — pending-запись и presigned PUT (байты грузит браузер).
    const result = await createPendingDocument(
      { leadId: id },
      employeeActor(auth.employee),
      parsed.data
    )
    return NextResponse.json(result, { status: 201 })'''

CREATE_CLIENT_LEADS = '''    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    // Клиент не может создать внутренний документ: createDocumentOnDeal
    // принудительно гасит isInternal для не-сотрудников (роадмап 5 —
    // внутренние принадлежат менеджеру).
    const document = await createDocumentOnDeal(
      { leadId: id },
      clientActor(auth.client),
      parsed.meta,
      parsed.file
    )
    // DF-02A (Блок 4): автор версии 1 — этот пользователь; в ответе
    // сразу имя человека (свой кабинет — коллега).
    const [projected] = await projectDocumentAuthors([document], {
      kind: 'client',
      customerId: auth.client.id,
    })
    return NextResponse.json({ document: projected }, { status: 201 })'''

CREATE_CLIENT_LEADS_NEW = '''    // DF-11: шаг 1 — pending-запись и presigned PUT (байты грузит браузер).
    // Клиент не может создать внутренний документ: createPendingDocument
    // принудительно гасит isInternal для не-сотрудников.
    const result = await createPendingDocument(
      { leadId: id },
      clientActor(auth.client),
      parsed.data
    )
    // DF-02A (Блок 4): автор версии 1 — этот пользователь; в ответе
    // сразу имя человека (свой кабинет — коллега).
    const [document] = await projectDocumentAuthors([result.document], {
      kind: 'client',
      customerId: auth.client.id,
    })
    return NextResponse.json({ ...result, document }, { status: 201 })'''

CREATE_BROKER_LEADS = '''    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    const document = await createDocumentOnDeal(
      { leadId: id },
      brokerActor(auth.broker),
      parsed.meta,
      parsed.file
    )
    // DF-02A (Блок 4): автор версии 1 — этот пользователь; в ответе
    // сразу имя человека (свой кабинет — коллега).
    const [projected] = await projectDocumentAuthors([document], {
      kind: 'broker',
      brokerId: auth.broker.id,
    })
    return NextResponse.json({ document: projected }, { status: 201 })'''

CREATE_BROKER_LEADS_NEW = '''    // DF-11: шаг 1 — pending-запись и presigned PUT (байты грузит браузер).
    const result = await createPendingDocument(
      { leadId: id },
      brokerActor(auth.broker),
      parsed.data
    )
    // DF-02A (Блок 4): автор версии 1 — этот пользователь; в ответе
    // сразу имя человека (свой кабинет — коллега).
    const [document] = await projectDocumentAuthors([result.document], {
      kind: 'broker',
      brokerId: auth.broker.id,
    })
    return NextResponse.json({ ...result, document }, { status: 201 })'''

VERSIONS_ADMIN = '''    const parsed = await parseDocumentVersionForm(req)
    if (!parsed.ok) return parsed.response

    const result = await addDocumentVersion(
      id,
      employeeActor(auth.employee),
      parsed.file,
      parsed.comment
    )
    if (!result) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }

    const deal: DocumentDealTarget = doc.orderId
      ? { orderId: doc.orderId }
      : { leadId: doc.leadId! }
    await logDocumentVersionAdded(
      deal,
      employeeActor(auth.employee),
      doc.title,
      result.version.version,
      parsed.comment,
      // DF-01: documentId связывает событие с документом (лента → файл)
      { isInternal: doc.isInternal, documentId: id }
    )

    return NextResponse.json({ version: result.version, document: result.document }, { status: 201 })'''

VERSIONS_ADMIN_NEW = '''    const result = await createPendingVersion(id, employeeActor(auth.employee), parsed.data)
    if (!result) {
      return NextResponse.json({ error: 'Документ не найден' }, { status: 404 })
    }

    // Событие document_version_added пишет confirm — в той же транзакции,
    // что и перевод версии в ready (DoD 9).
    return NextResponse.json(result, { status: 201 })'''

def versions_external(actor: str, kind: str, id_field: str) -> tuple[str, str]:
    old = f'''    const parsed = await parseDocumentVersionForm(req)
    if (!parsed.ok) return parsed.response

    const result = await addDocumentVersion(
      id,
      {actor}(auth.{kind}),
      parsed.file,
      parsed.comment
    )
    if (!result) {{
      return NextResponse.json({{ error: 'Документ не найден' }}, {{ status: 404 }})
    }}

    const deal: DocumentDealTarget = doc.orderId
      ? {{ orderId: doc.orderId }}
      : {{ leadId: doc.leadId! }}
    await logDocumentVersionAdded(
      deal,
      {actor}(auth.{kind}),
      doc.title,
      result.version.version,
      parsed.comment,
      // DF-01: documentId связывает событие с документом (лента → файл)
      {{ documentId: id }}
    )

    // DF-02A (Блок 4): автор новой версии — этот пользователь; в ответе
    // сразу имя человека (свой кабинет — коллега).
    const [version] = await projectAuthors([result.version], {{
      kind: '{kind}',
      {id_field}: auth.{kind}.id,
    }})
    const [document] = await projectDocumentAuthors([result.document], {{
      kind: '{kind}',
      {id_field}: auth.{kind}.id,
    }})
    return NextResponse.json({{ version, document }}, {{ status: 201 }})'''
    new = f'''    const result = await createPendingVersion(id, {actor}(auth.{kind}), parsed.data)
    if (!result) {{
      return NextResponse.json({{ error: 'Документ не найден' }}, {{ status: 404 }})
    }}

    // Событие document_version_added пишет confirm — в той же транзакции,
    // что и перевод версии в ready (DoD 9). DF-02A: автор новой версии —
    // этот пользователь; в ответе сразу имя человека (свой кабинет — коллега).
    const [version] = await projectAuthors([result.version], {{
      kind: '{kind}',
      {id_field}: auth.{kind}.id,
    }})
    const [document] = await projectDocumentAuthors([result.document], {{
      kind: '{kind}',
      {id_field}: auth.{kind}.id,
    }})
    return NextResponse.json({{ version, document, upload: result.upload }}, {{ status: 201 }})'''
    return old, new

DOC_IMPORTS_OLD = """import {
  DOC_PUBLIC_FIELDS,
  createDocumentOnDeal,
  parseDocumentCreateForm,
} from '@/lib/documents'"""
DOC_IMPORTS_NEW = """import { DOC_LIST_READY_WHERE, DOC_PUBLIC_FIELDS } from '@/lib/documents'
import {
  createPendingDocument,
  DocumentCreateUploadSchema,
  readJsonBody,
} from '@/lib/document-upload'"""

VER_IMPORTS_ADMIN_OLD = """import {
  addDocumentVersion,
  logDocumentVersionAdded,
  parseDocumentVersionForm,
  type DocumentDealTarget,
} from '@/lib/documents'"""
VER_IMPORTS_ADMIN_NEW = """import {
  createPendingVersion,
  DocumentVersionUploadSchema,
  readJsonBody,
} from '@/lib/document-upload'"""

VER_IMPORTS_CLIENT_OLD = """import {
  addDocumentVersion,
  documentVisibleToClient,
  logDocumentVersionAdded,
  parseDocumentVersionForm,
  type DocumentDealTarget,
} from '@/lib/documents'"""
VER_IMPORTS_CLIENT_NEW = """import { documentVisibleToClient } from '@/lib/documents'
import {
  createPendingVersion,
  DocumentVersionUploadSchema,
  readJsonBody,
} from '@/lib/document-upload'"""

VER_IMPORTS_BROKER_OLD = """import {
  addDocumentVersion,
  documentVisibleToBroker,
  logDocumentVersionAdded,
  parseDocumentVersionForm,
  type DocumentDealTarget,
} from '@/lib/documents'"""
VER_IMPORTS_BROKER_NEW = """import { documentVisibleToBroker } from '@/lib/documents'
import {
  createPendingVersion,
  DocumentVersionUploadSchema,
  readJsonBody,
} from '@/lib/document-upload'"""

PERMIT_DOC_IMPORTS = {
  "admin": ("""import { parseDocumentCreateForm } from '@/lib/documents'
import { closePermitWithDocument } from '@/lib/permits-db'""",
"""import {
  createPendingDocument,
  PermitDocumentUploadSchema,
  readJsonBody,
} from '@/lib/document-upload'
import { permitTargetOf } from '@/lib/permits-db'"""),
  "client": ("""import { parseDocumentCreateForm } from '@/lib/documents'
import { closePermitWithDocument } from '@/lib/permits-db'""",
"""import {
  createPendingDocument,
  PermitDocumentUploadSchema,
  readJsonBody,
} from '@/lib/document-upload'
import { permitTargetOf } from '@/lib/permits-db'"""),
  "broker": ("""import { parseDocumentCreateForm } from '@/lib/documents'
import { closePermitWithDocument } from '@/lib/permits-db'""",
"""import {
  createPendingDocument,
  PermitDocumentUploadSchema,
  readJsonBody,
} from '@/lib/document-upload'
import { permitTargetOf } from '@/lib/permits-db'"""),
}

def permit_block(actor: str) -> str:
    return f'''    const parsed = await parseDocumentCreateForm(req)
    if (!parsed.ok) return parsed.response

    const result = await closePermitWithDocument(
      id,
      {actor},
      {{ title: parsed.meta.title || permit.title, comment: parsed.meta.comment }},
      parsed.file
    )
    if ('error' in result) {{
      return NextResponse.json({{ error: result.error }}, {{ status: result.status }})
    }}
    return NextResponse.json({{ permit: result.permit, documentId: result.documentId }}, {{ status: 201 }})'''

def permit_block_new(actor: str) -> str:
    return f'''    if (permit.status !== 'pending') {{
      return NextResponse.json(
        {{ error: 'Строка уже закрыта — документ прикладывается версиями к загруженному' }},
        {{ status: 409 }}
      )
    }}

    const body = await readJsonBody(req)
    const parsed = PermitDocumentUploadSchema.safeParse(body)
    if (!parsed.success) {{
      return NextResponse.json(
        {{ error: 'Некорректные данные', details: parsed.error.flatten() }},
        {{ status: 400 }}
      )
    }}

    // DF-11 × DF-16: строку закрывает confirm подтверждённого документа
    // (permitRequirementId в теле confirm), здесь — шаг 1: pending-документ
    // вида permit и presigned PUT.
    const result = await createPendingDocument(permitTargetOf(permit), {actor}, {{
      type: 'permit',
      title: parsed.data.title?.trim() || permit.title,
      isInternal: false,
      comment: parsed.data.comment,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      size: parsed.data.size,
    }})
    return NextResponse.json({{ ...result, permitRequirementId: permit.id }}, {{ status: 201 }})'''

def main():
    # ── Создание документов (6 роутов) — уже переписаны первым прогоном ──
    done = (
        'api/admin/orders/[id]/documents/route.ts',
        'api/client/orders/[id]/documents/route.ts',
        'api/broker/orders/[id]/documents/route.ts',
        'api/admin/leads/[id]/documents/route.ts',
        'api/client/leads/[id]/documents/route.ts',
        'api/broker/leads/[id]/documents/route.ts',
        'api/admin/documents/[id]/versions/route.ts',
    )
    for portal, actor, block_old, block_new, where_old, where_new in [
        ('api/admin/orders/[id]/documents/route.ts', 'employee',
         CREATE_ADMIN_ORDERS, CREATE_ADMIN_ORDERS_NEW, 'where: { orderId: id },', 'where: { orderId: id, ...DOC_LIST_READY_WHERE },'),
        ('api/client/orders/[id]/documents/route.ts', 'client',
         CREATE_CLIENT_ORDERS, CREATE_CLIENT_ORDERS_NEW, 'where: { orderId: id, isInternal: false },', 'where: { orderId: id, isInternal: false, ...DOC_LIST_READY_WHERE },'),
        ('api/broker/orders/[id]/documents/route.ts', 'broker',
         CREATE_BROKER_ORDERS, CREATE_BROKER_ORDERS_NEW, 'where: { orderId: id, isInternal: false },', 'where: { orderId: id, isInternal: false, ...DOC_LIST_READY_WHERE },'),
        ('api/admin/leads/[id]/documents/route.ts', 'employee',
         CREATE_ADMIN_LEADS, CREATE_ADMIN_LEADS_NEW, 'where: { leadId: id },', 'where: { leadId: id, ...DOC_LIST_READY_WHERE },'),
        ('api/client/leads/[id]/documents/route.ts', 'client',
         CREATE_CLIENT_LEADS, CREATE_CLIENT_LEADS_NEW, 'where: { leadId: id, isInternal: false },', 'where: { leadId: id, isInternal: false, ...DOC_LIST_READY_WHERE },'),
        ('api/broker/leads/[id]/documents/route.ts', 'broker',
         CREATE_BROKER_LEADS, CREATE_BROKER_LEADS_NEW, 'where: { leadId: id, isInternal: false },', 'where: { leadId: id, isInternal: false, ...DOC_LIST_READY_WHERE },'),
    ]:
        if portal in done:
            continue
        p = ROOT / portal
        s = p.read_text(encoding='utf-8')
        assert s.count(block_old) == 1, f'{p}: POST-блок не найден'
        s = s.replace(block_old, block_new)
        pre = VALID_BODY.replace('%SCHEMA%', 'DocumentCreateUploadSchema')
        s = s.replace(block_new, pre + block_new)
        assert s.count(where_old) >= 1, f'{p}: GET-where не найден'
        s = s.replace(where_old, where_new, 1)
        assert DOC_IMPORTS_OLD in s, f'{p}: импорты не найдены'
        s = s.replace(DOC_IMPORTS_OLD, DOC_IMPORTS_NEW)
        p.write_text(s, encoding='utf-8')
        print(f'OK {p}')

    # ── Версии (3 роута) ──
    p = ROOT / 'api/admin/documents/[id]/versions/route.ts'
    if 'createPendingVersion' not in p.read_text(encoding='utf-8'):
        old, new = VERSIONS_ADMIN, VERSIONS_ADMIN_NEW
        s = p.read_text(encoding='utf-8')
        assert s.count(old) == 1, f'{p}: POST-блок не найден'
        s = s.replace(old, pre_block(new, 'DocumentVersionUploadSchema'))
        assert VER_IMPORTS_ADMIN_OLD in s, f'{p}: импорты не найдены'
        s = s.replace(VER_IMPORTS_ADMIN_OLD, VER_IMPORTS_ADMIN_NEW)
        p.write_text(s, encoding='utf-8')
    print(f'OK {p}')

    for fname, imports_old, imports_new, actor, kind, id_field in [
        ('api/client/documents/[id]/versions/route.ts', VER_IMPORTS_CLIENT_OLD, VER_IMPORTS_CLIENT_NEW, 'clientActor', 'client', 'customerId'),
        ('api/broker/documents/[id]/versions/route.ts', VER_IMPORTS_BROKER_OLD, VER_IMPORTS_BROKER_NEW, 'brokerActor', 'broker', 'brokerId'),
    ]:
        p = ROOT / fname
        old, new = versions_external(actor, kind, id_field)
        s = p.read_text(encoding='utf-8')
        assert s.count(old) == 1, f'{p}: POST-блок не найден'
        s = s.replace(old, pre_block(new, 'DocumentVersionUploadSchema'))
        assert imports_old in s, f'{p}: импорты не найдены'
        s = s.replace(imports_old, imports_new)
        p.write_text(s, encoding='utf-8')
        print(f'OK {p}')

    # ── Разрешительные (3 роута) ──
    for fname, actor, old_imp, new_imp in [
        ('api/admin/permits/[id]/document/route.ts', 'employeeActor(auth.employee)', *PERMIT_DOC_IMPORTS['admin']),
        ('api/client/permits/[id]/document/route.ts', 'clientActor(auth.client)', *PERMIT_DOC_IMPORTS['client']),
        ('api/broker/permits/[id]/document/route.ts', 'brokerActor(auth.broker)', *PERMIT_DOC_IMPORTS['broker']),
    ]:
        p = ROOT / fname
        s = p.read_text(encoding='utf-8')
        old = permit_block(actor)
        assert s.count(old) == 1, f'{p}: POST-блок не найден'
        s = s.replace(old, permit_block_new(actor))
        assert old_imp in s, f'{p}: импорты не найдены'
        s = s.replace(old_imp, new_imp)
        p.write_text(s, encoding='utf-8')
        print(f'OK {p}')

def pre_block(text: str, schema: str) -> str:
    return VALID_BODY.replace('%SCHEMA%', schema) + text

if __name__ == '__main__':
    main()
