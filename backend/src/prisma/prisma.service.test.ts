import assert from 'node:assert/strict'
import test from 'node:test'
import { PrismaService } from './prisma.service'

const connectionFailure = new Error('database unavailable')

class UnavailablePrismaService extends PrismaService {
  override async $connect(): Promise<void> {
    throw connectionFailure
  }
}

test('onModuleInit rejects when the database connection fails', async () => {
  const prisma = new UnavailablePrismaService()

  await assert.rejects(prisma.onModuleInit(), connectionFailure)
})
