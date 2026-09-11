import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
async function main() {
  const rows = await p.order.findMany({ where: { isDraft: null }, select: { id: true, name: true, isDraft: true, status: true } })
  console.log('null-isDraft rows:', JSON.stringify(rows))
  await p.$disconnect()
}
main()
