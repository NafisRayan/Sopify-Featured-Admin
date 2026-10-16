#!/usr/bin/env node
import { spawn } from 'node:child_process'

const args = [
  '--import',
  'tsx',
  '--test',
  'src/prisma/prisma.service.test.ts',
  'src/common/relay-and-goi.test.ts',
  'src/modules/customers/b2b-merge.test.ts',
  'src/common/tenant-acl.smoke.test.ts',
  'src/modules/payments/sqa-fixes.smoke.test.ts',
  'src/modules/system/health.smoke.test.ts',
  'src/modules/reviews/reviews.smoke.test.ts',
  'src/modules/orders/returns.smoke.test.ts',
  'src/modules/shop/analytics.smoke.test.ts',
  'src/modules/orders/fulfillment.smoke.test.ts',
  'src/modules/storefront/tenant-isolation.smoke.test.ts',
  'src/modules/storefront/discounts-recovery.smoke.test.ts',
  'src/modules/storefront/storefront.smoke.test.ts',
  'src/modules/storefront/storefront.e2e.test.ts',
  'src/modules/payments/payments.smoke.test.ts',
  'src/modules/storefront/customer.smoke.test.ts',
]

const child = spawn(process.execPath, args, { stdio: ['inherit', 'pipe', 'pipe'] })

let stdout = ''
let stderr = ''

child.stdout.on('data', (d) => {
  const str = d.toString()
  process.stdout.write(str)
  stdout += str
})

child.stderr.on('data', (d) => {
  const str = d.toString()
  process.stderr.write(str)
  stderr += str
})

child.on('close', (code) => {
  if (code !== 0) {
    process.exit(code || 1)
  }

  // Check TAP skipped count: e.g. "# skipped 5"
  const skipMatch = stdout.match(/#\s+skipped\s+(\d+)/)
  const skippedCount = skipMatch ? Number(skipMatch[1]) : 0

  if (skippedCount > 0) {
    console.error(
      `\n❌ CI FAILURE: ${skippedCount} test(s) were skipped. In CI, DATABASE_URL must be reachable so all tests execute.\n`,
    )
    process.exit(1)
  }

  console.log('\n✔ CI Test check: 0 skipped tests. All tests executed.\n')
  process.exit(0)
})
