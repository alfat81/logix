import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

function findApiRouteFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...findApiRouteFiles(full))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(full)
    }
  }
  return files
}

describe('Permissions Guard & Write Routes Check (DF-00 / P1-09)', () => {
  const adminApiDir = path.resolve(process.cwd(), 'src/app/api/admin')
  const routeFiles = findApiRouteFiles(adminApiDir)

  it('ensures all mutating export methods have { write: true } in requireEmployee', () => {
    const mutatingRegex = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/g

    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      const matches = [...content.matchAll(mutatingRegex)]
      if (matches.length > 0) {
        // Must contain requireEmployee with write: true or delegated call (like patchLead/patchOrder)
        const hasWriteCheck =
          content.includes('write: true') ||
          content.includes('patchLead') ||
          content.includes('patchOrder')
        expect(
          hasWriteCheck,
          `File ${path.relative(process.cwd(), file)} has mutating methods without write: true`
        ).toBe(true)
      }
    }
  })

  it('verifies master-only routes enforce roles: [\'master\']', () => {
    const masterOnlyFiles = [
      'src/app/api/admin/stage-catalog/route.ts',
      'src/app/api/admin/stage-catalog/[id]/route.ts',
      'src/app/api/admin/legal-entities/route.ts',
      'src/app/api/admin/legal-entities/[id]/route.ts',
      'src/app/api/admin/employees/route.ts',
      'src/app/api/admin/employees/[id]/route.ts',
    ]

    for (const relPath of masterOnlyFiles) {
      const fullPath = path.resolve(process.cwd(), relPath)
      const content = fs.readFileSync(fullPath, 'utf-8')
      expect(
        content.includes("'master'") || content.includes('"master"'),
        `${relPath} must enforce master role`
      ).toBe(true)
    }

    // Also verify leads [id] DELETE enforces master
    const leadRoute = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/api/admin/leads/[id]/route.ts'),
      'utf-8'
    )
    expect(leadRoute).toMatch(/DELETE[\s\S]*?roles:\s*\[['"]master['"]\]/)
  })
})
