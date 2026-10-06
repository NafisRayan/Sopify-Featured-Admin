import { Injectable, Module } from '@nestjs/common'
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql'
import { PrismaService } from '../../prisma/prisma.service'
import { PrismaModule } from '../../prisma/prisma.module'
import { parseJson, toJson } from '../../common/helpers'
import { mapTransfer } from '../../common/mappers'
import { uid } from '../../common/ids'
import { actorId, actorName } from '../../auth/actor'

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  private async log(variantId: string, locationId: string, change: number, resulting: number, reason: string) {
    await this.prisma.inventoryHistory.create({
      data: { id: uid('ih'), variantId, locationId, change, resultingAvailable: resulting, reason, createdAt: new Date(), author: actorName() },
    })
  }

  private async logActivity(action: string, resource: string, resourceId?: string) {
    await this.prisma.activityEntry.create({
      data: { id: uid('act'), at: new Date(), staffId: actorId(), staffName: actorName(), action, resource, resourceId: resourceId ?? null },
    })
  }

  async locations() {
    return this.prisma.location.findMany({ orderBy: { createdAt: 'asc' } })
  }

  async levels(locationId?: string) {
    const rows = await this.prisma.inventoryLevel.findMany(locationId ? { where: { locationId } } : undefined)
    return rows.map((l) => ({ ...l, onHand: l.available + l.committed + l.unavailable }))
  }

  async history(variantId: string) {
    return this.prisma.inventoryHistory.findMany({ where: { variantId }, orderBy: { createdAt: 'desc' } })
  }

  async createLocation(input: Record<string, any>) {
    const row = await this.prisma.location.create({
      data: {
        id: uid('loc'),
        name: input.name,
        address1: input.address1 ?? '',
        city: input.city ?? '',
        province: input.province ?? '',
        country: input.country ?? 'United States',
        zip: input.zip ?? '',
        phone: input.phone ?? null,
        active: input.active ?? true,
        createdAt: new Date(),
      },
    })
    await this.logActivity('Created location', 'location', row.id)
    return row
  }

  async updateLocation(id: string, input: Record<string, any>) {
    const existing = await this.prisma.location.findUnique({ where: { id } })
    if (!existing) throw new Error('Location not found')
    const data: Record<string, unknown> = {}
    for (const key of ['name', 'address1', 'city', 'province', 'country', 'zip', 'phone', 'active']) {
      if (input[key] !== undefined) data[key] = input[key]
    }
    await this.prisma.location.update({ where: { id }, data })
    if (input.active === false) await this.logActivity('Deactivated location', 'location', id)
    if (input.active === true) await this.logActivity('Activated location', 'location', id)
    return this.prisma.location.findUnique({ where: { id } })
  }

  async adjust(input: any)  {
    if (!input.availableDelta) throw new Error('availableDelta must be non-zero')
    let level = await this.prisma.inventoryLevel.findUnique({
      where: { variantId_locationId: { variantId: input.variantId, locationId: input.locationId } },
    })
    if (!level) level = await this.prisma.inventoryLevel.create({ data: { variantId: input.variantId, locationId: input.locationId, available: 0, committed: 0, unavailable: 0 } })
    const available = Math.max(0, level.available + input.availableDelta)
    await this.prisma.inventoryLevel.update({
      where: { variantId_locationId: { variantId: input.variantId, locationId: input.locationId } },
      data: { available },
    })
    await this.log(input.variantId, input.locationId, available - level.available, available, input.reason ?? 'Manual adjustment')
    await this.logActivity('Adjusted inventory', 'inventory', input.variantId)
    return { ...level, available, onHand: available + level.committed + level.unavailable }
  }

  async bulkAdjust(variantIds: string[], locationId: string, delta: number, reason?: string) {
    const levels: Record<string, unknown>[] = []
    for (const variantId of variantIds) {
      try {
        levels.push(await this.adjust({ variantId, locationId, availableDelta: delta, reason: reason ?? 'Bulk adjustment' }))
      } catch {
        // skip failures in bulk
      }
    }
    return { levels, userErrors: [] }
  }

  async locationsCount(): Promise<number> {
    return this.prisma.location.count()
  }

  async setOnHand(input: { variantId: string; locationId: string; setQuantity: number; reason?: string }) {
    if (input.setQuantity == null || input.setQuantity < 0) throw new Error('setQuantity must be greater than or equal to 0')
    const variant = await this.prisma.product.findFirst({ where: { variants: { array_contains: [{ id: input.variantId }] } } })
    if (!variant) throw new Error('Variant not found')
    const location = await this.prisma.location.findUnique({ where: { id: input.locationId } })
    if (!location) throw new Error('Location not found')
    let level = await this.prisma.inventoryLevel.findUnique({
      where: { variantId_locationId: { variantId: input.variantId, locationId: input.locationId } },
    })
    if (!level) level = await this.prisma.inventoryLevel.create({ data: { variantId: input.variantId, locationId: input.locationId, available: 0, committed: 0, unavailable: 0 } })
    const available = Math.max(0, input.setQuantity - level.committed - level.unavailable)
    await this.prisma.inventoryLevel.update({
      where: { variantId_locationId: { variantId: input.variantId, locationId: input.locationId } },
      data: { available },
    })
    await this.log(input.variantId, input.locationId, available - level.available, available, input.reason ?? 'count')
    await this.logActivity('Set on-hand quantity', 'inventory', input.variantId)
    return { ...level, available, onHand: available + level.committed + level.unavailable }
  }

  async moveQuantities(input: { variantId: string; fromLocationId: string; toLocationId: string; quantity: number; reason?: string }) {
    if (input.fromLocationId === input.toLocationId) throw new Error('Choose two different locations')
    if (!input.quantity || input.quantity <= 0) throw new Error('quantity must be greater than zero')
    const source = await this.prisma.inventoryLevel.findUnique({
      where: { variantId_locationId: { variantId: input.variantId, locationId: input.fromLocationId } },
    })
    if (!source || source.available < input.quantity) {
      throw new Error(`Insufficient stock at source location (has ${source?.available ?? 0}, needs ${input.quantity})`)
    }
    let dest = await this.prisma.inventoryLevel.findUnique({
      where: { variantId_locationId: { variantId: input.variantId, locationId: input.toLocationId } },
    })
    if (!dest) dest = await this.prisma.inventoryLevel.create({ data: { variantId: input.variantId, locationId: input.toLocationId, available: 0, committed: 0, unavailable: 0 } })

    const srcAvailable = source.available - input.quantity
    const dstAvailable = dest.available + input.quantity
    // Both legs move atomically — a crash can no longer drop units between locations.
    await this.prisma.$transaction([
      this.prisma.inventoryLevel.update({
        where: { variantId_locationId: { variantId: input.variantId, locationId: input.fromLocationId } },
        data: { available: srcAvailable },
      }),
      this.prisma.inventoryHistory.create({
        data: { id: uid('ih'), variantId: input.variantId, locationId: input.fromLocationId, change: -input.quantity, resultingAvailable: srcAvailable, reason: input.reason ?? `Moved to ${input.toLocationId}`, createdAt: new Date(), author: actorName() },
      }),
      this.prisma.inventoryLevel.update({
        where: { variantId_locationId: { variantId: input.variantId, locationId: input.toLocationId } },
        data: { available: dstAvailable },
      }),
      this.prisma.inventoryHistory.create({
        data: { id: uid('ih'), variantId: input.variantId, locationId: input.toLocationId, change: input.quantity, resultingAvailable: dstAvailable, reason: input.reason ?? `Moved from ${input.fromLocationId}`, createdAt: new Date(), author: actorName() },
      }),
    ])

    await this.logActivity('Moved inventory', 'inventory', input.variantId)
    return [
      { ...source, available: srcAvailable, onHand: srcAvailable + source.committed + source.unavailable },
      { ...dest, available: dstAvailable, onHand: dstAvailable + dest.committed + dest.unavailable },
    ]
  }

  async transfers() {
    const rows = await this.prisma.transfer.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map((r) => mapTransfer(r as unknown as Record<string, unknown>))
  }

  async transfer(id: string) {
    const row = await this.prisma.transfer.findUnique({ where: { id } })
    return row ? mapTransfer(row as unknown as Record<string, unknown>) : null
  }

  async createTransfer(input: any) {
    if (input.fromLocationId === input.toLocationId) throw new Error('Choose two different locations')
    if (!input.lines.length) throw new Error('Add at least one item')
    const lines = []
    for (const line of input.lines) {
      const product = await this.prisma.product.findFirst({ where: { variants: { array_contains: [{ id: line.variantId }] } } })
      if (!product) throw new Error('Invalid variant')
      const variant = parseJson<{ id: string; sku: string; title: string }[]>(product.variants as string, []).find((v) => v.id === line.variantId)!
      lines.push({ id: uid('itl'), variantId: line.variantId, sku: variant.sku, title: product.title, variantTitle: variant.title === 'Default Title' ? '' : variant.title, quantity: line.quantity, receivedQuantity: 0 })
    }
    const count = await this.prisma.transfer.count()
    const row = await this.prisma.transfer.create({
      data: {
        id: uid('tf'),
        name: `TF-${1001 + count}`,
        status: 'draft',
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        lines: toJson(lines),
        note: input.note ?? null,
        createdAt: new Date(),
      },
    })
    await this.logActivity('Created transfer', 'transfer', row.id)
    return mapTransfer(row as unknown as Record<string, unknown>)
  }

  async sendTransfer(id: string) {
    const t = await this.prisma.transfer.findUnique({ where: { id } })
    if (!t) throw new Error('Transfer not found')
    if (t.status !== 'draft') throw new Error('Transfer already sent')
    const lines = parseJson<{ variantId: string; quantity: number }[]>(t.lines as string, [])
    // validate source stock before moving anything
    for (const line of lines) {
      const level = await this.prisma.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId: line.variantId, locationId: t.fromLocationId } } })
      if ((level?.available ?? 0) < line.quantity) {
        throw new Error(`Insufficient stock at source location (has ${level?.available ?? 0}, needs ${line.quantity})`)
      }
    }
    for (const line of lines) {
      const level = await this.prisma.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId: line.variantId, locationId: t.fromLocationId } } })
      const available = Math.max(0, (level?.available ?? 0) - line.quantity)
      if (level) {
        await this.prisma.inventoryLevel.update({ where: { variantId_locationId: { variantId: line.variantId, locationId: t.fromLocationId } }, data: { available } })
      }
      await this.log(line.variantId, t.fromLocationId, available - (level?.available ?? 0), available, `Outgoing ${t.name}`)
    }
    await this.prisma.transfer.update({ where: { id }, data: { status: 'in_transit', sentAt: new Date() } })
    await this.logActivity('Sent transfer', 'transfer', id)
    return this.transfer(id)
  }

  async receiveTransfer(id: string) {
    const t = await this.prisma.transfer.findUnique({ where: { id } })
    if (!t) throw new Error('Transfer not found')
    if (t.status !== 'in_transit') throw new Error('Only in-transit transfers can be received')
    const lines = parseJson<{ variantId: string; quantity: number; receivedQuantity: number }[]>(t.lines as string, [])
    for (const line of lines) {
      const level = await this.prisma.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId: line.variantId, locationId: t.toLocationId } } })
      const current = level?.available ?? 0
      const available = current + line.quantity
      if (level) {
        await this.prisma.inventoryLevel.update({ where: { variantId_locationId: { variantId: line.variantId, locationId: t.toLocationId } }, data: { available } })
      } else {
        await this.prisma.inventoryLevel.create({ data: { variantId: line.variantId, locationId: t.toLocationId, available, committed: 0, unavailable: 0 } })
      }
      await this.log(line.variantId, t.toLocationId, line.quantity, available, `Incoming ${t.name}`)
    }
    await this.prisma.transfer.update({
      where: { id },
      data: { status: 'received', receivedAt: new Date(), lines: toJson(lines.map((l) => ({ ...l, receivedQuantity: l.quantity }))) },
    })
    await this.logActivity('Received transfer', 'transfer', id)
    return this.transfer(id)
  }
}

@Resolver('Location')
export class InventoryResolver {
  constructor(private readonly service: InventoryService) {}

  @Query()
  locations() {
    return this.service.locations()
  }

  @Query()
  inventoryLevels(@Args('locationId', { nullable: true }) locationId?: string) {
    return this.service.levels(locationId)
  }

  @Query()
  inventoryHistory(@Args('variantId') variantId: string) {
    return this.service.history(variantId)
  }

  @Query()
  transfers() {
    return this.service.transfers()
  }

  @Query()
  transfer(@Args('id') id: string) {
    return this.service.transfer(id)
  }

  @Mutation()
  async locationCreate(@Args('location') location: Record<string, any>) {
    try {
      return { location: await this.service.createLocation(location), userErrors: [] }
    } catch (e) {
      return { location: null, userErrors: [{ field: ['location'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async locationUpdate(@Args('id') id: string, @Args('location') location: Record<string, any>) {
    try {
      return { location: await this.service.updateLocation(id, location), userErrors: [] }
    } catch (e) {
      return { location: null, userErrors: [{ field: ['location'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async inventoryAdjust(@Args('input') input: Record<string, any>) {
    try {
      return { level: await this.service.adjust(input), userErrors: [] }
    } catch (e) {
      return { level: null, userErrors: [{ field: ['input'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async inventoryBulkAdjust(@Args() input: Record<string, any>) {
    return this.service.bulkAdjust(input.variantIds, input.locationId, input.availableDelta, input.reason)
  }

  @Mutation()
  async inventoryTransferCreate(@Args('input') input: Record<string, any>) {
    try {
      return { transfer: await this.service.createTransfer(input), userErrors: [] }
    } catch (e) {
      return { transfer: null, userErrors: [{ field: ['input'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async inventoryTransferSend(@Args('id') id: string) {
    try {
      return { transfer: await this.service.sendTransfer(id), userErrors: [] }
    } catch (e) {
      return { transfer: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async inventoryTransferReceive(@Args('id') id: string) {
    try {
      return { transfer: await this.service.receiveTransfer(id), userErrors: [] }
    } catch (e) {
      return { transfer: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Query()
  locationsCount() {
    return this.service.locationsCount()
  }

  @Mutation()
  async inventorySetOnHandQuantities(@Args('input') input: { variantId: string; locationId: string; setQuantity: number; reason?: string }) {
    try {
      return { level: await this.service.setOnHand(input), userErrors: [] }
    } catch (e) {
      return { level: null, userErrors: [{ field: ['input'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async inventoryMoveQuantities(@Args('input') input: { variantId: string; fromLocationId: string; toLocationId: string; quantity: number; reason?: string }) {
    try {
      return { levels: await this.service.moveQuantities(input), userErrors: [] }
    } catch (e) {
      return { levels: [], userErrors: [{ field: ['input'], message: (e as Error).message }] }
    }
  }
}

@Module({
  imports: [PrismaModule],
  providers: [InventoryResolver, InventoryService],
})
export class InventoryModule {}
