#!/usr/bin/env node
/**
 * Asserts every Mutation field in root.graphql has a MUTATION_PERMISSIONS entry (and no orphans).
 * Run: npm run check:authz
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sdl = readFileSync(join(root, 'src/graphql/schema/root.graphql'), 'utf8')
const mapSrc = readFileSync(join(root, 'src/auth/mutation-permissions.ts'), 'utf8')

const mutBlock = sdl.match(/type Mutation \{([\s\S]*?)\n\}/)?.[1] ?? ''
const sdlMutations = [...mutBlock.matchAll(/^\s+(\w+)(?:\(|\s*:)/gm)].map((m) => m[1])
const mapKeys = [...mapSrc.matchAll(/^\s+(\w+):/gm)].map((m) => m[1])

const missing = sdlMutations.filter((m) => !mapKeys.includes(m))
const extra = mapKeys.filter((m) => !sdlMutations.includes(m))

if (missing.length || extra.length) {
  console.error('Mutation permission map mismatch:')
  if (missing.length) console.error('  Missing from MUTATION_PERMISSIONS:', missing.join(', '))
  if (extra.length) console.error('  Orphan map keys (not in SDL):', extra.join(', '))
  process.exit(1)
}

console.log(`OK: ${sdlMutations.length} mutations ↔ ${mapKeys.length} permission map entries`)
