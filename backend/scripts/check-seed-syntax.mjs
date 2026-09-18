#!/usr/bin/env node
/**
 * Syntax-only parse check for prisma/seed.ts (build tsconfig excludes it).
 * Catches truncated/corrupt seed files that npm run build would miss.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const seedPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'seed.ts')
const source = readFileSync(seedPath, 'utf8')

if (source.includes('[Showing lines')) {
  console.error('seed.ts contains read-tool truncation garbage — file is corrupt')
  process.exit(1)
}

const sf = ts.createSourceFile(seedPath, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const diags = sf.parseDiagnostics
if (diags.length) {
  for (const d of diags) {
    const { line, character } = sf.getLineAndCharacterOfPosition(d.start ?? 0)
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n')
    console.error(`seed.ts:${line + 1}:${character + 1}: ${msg}`)
  }
  process.exit(1)
}

if (!source.includes('main()') || !source.includes('Seed complete')) {
  console.error('seed.ts is missing main() invocation or completion log — tail may be truncated')
  process.exit(1)
}

console.log('OK: prisma/seed.ts parses and has expected tail')
