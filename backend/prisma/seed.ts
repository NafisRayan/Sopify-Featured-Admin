/**
 * Seeds the Neon database from the frontend demo data (frontend/src/data/*.json).
 * Usage:
 *   npm run seed            # upsert-like: clears + inserts demo data
 *   npm run seed:reset      # identical (kept for symmetry)
 */
import { PrismaClient } from '@prisma/client'
import { reseed, resolveDataDir } from '../src/seed/seed-core'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  const dir = resolveDataDir()
  console.log(`Seeding from ${dir}…`)
  const counts = await reseed(prisma, dir)
  console.log('✔ Seed complete:', counts)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
