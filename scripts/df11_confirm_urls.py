#!/usr/bin/env python3
"""DF-11: confirmUrl в ответах create/versions/permit-роутов (проход 2)."""
from pathlib import Path
import sys

ROOT = Path('/home/z/my-project/src/app')

def sub(path: str, old: str, new: str):
    p = ROOT / path
    s = p.read_text(encoding='utf-8')
    if s.count(old) != 1:
        sys.exit(f'FAIL {p}: якорь {s.count(old)}x')
    p.write_text(s.replace(old, new), encoding='utf-8')
    print(f'OK {p}')

CONFIRM = "/api/{portal}/document-versions/${{result.version.id}}/confirm"

def create_ret(portal: str) -> tuple[str, str]:
    old = '    return NextResponse.json(result, { status: 201 })'
    new = f'    return NextResponse.json({{ ...result, confirmUrl: `/api/{portal}/document-versions/${{result.version.id}}/confirm` }}, {{ status: 201 }})'
    return old, new

def create_projected_ret(portal: str) -> tuple[str, str]:
    old = '    return NextResponse.json({ ...result, document }, { status: 201 })'
    new = f'    return NextResponse.json({{ ...result, document, confirmUrl: `/api/{portal}/document-versions/${{result.version.id}}/confirm` }}, {{ status: 201 }})'
    return old, new

def versions_ret(portal: str) -> tuple[str, str]:
    old = '    return NextResponse.json(result, { status: 201 })'
    new = f'    return NextResponse.json({{ ...result, confirmUrl: `/api/{portal}/document-versions/${{result.version.id}}/confirm` }}, {{ status: 201 }})'
    return old, new

def versions_projected_ret(portal: str) -> tuple[str, str]:
    old = '    return NextResponse.json({ version, document, upload: result.upload }, { status: 201 })'
    new = f'    return NextResponse.json({{ version, document, upload: result.upload, confirmUrl: `/api/{portal}/document-versions/${{result.version.id}}/confirm` }}, {{ status: 201 }})'
    return old, new

def permit_ret(portal: str) -> tuple[str, str]:
    old = '    return NextResponse.json({ ...result, permitRequirementId: permit.id }, { status: 201 })'
    new = f'    return NextResponse.json({{ ...result, permitRequirementId: permit.id, confirmUrl: `/api/{portal}/document-versions/${{result.version.id}}/confirm` }}, {{ status: 201 }})'
    return old, new

main = [
    ('api/admin/orders/[id]/documents/route.ts', create_ret('admin')),
    ('api/admin/leads/[id]/documents/route.ts', create_ret('admin')),
    ('api/client/orders/[id]/documents/route.ts', create_projected_ret('client')),
    ('api/client/leads/[id]/documents/route.ts', create_projected_ret('client')),
    ('api/broker/orders/[id]/documents/route.ts', create_projected_ret('broker')),
    ('api/broker/leads/[id]/documents/route.ts', create_projected_ret('broker')),
    ('api/admin/documents/[id]/versions/route.ts', versions_ret('admin')),
    ('api/client/documents/[id]/versions/route.ts', versions_projected_ret('client')),
    ('api/broker/documents/[id]/versions/route.ts', versions_projected_ret('broker')),
    ('api/admin/permits/[id]/document/route.ts', permit_ret('admin')),
    ('api/client/permits/[id]/document/route.ts', permit_ret('client')),
    ('api/broker/permits/[id]/document/route.ts', permit_ret('broker')),
]
for path, (old, new) in main:
    sub(path, old, new)
print('Все confirmUrl добавлены')
