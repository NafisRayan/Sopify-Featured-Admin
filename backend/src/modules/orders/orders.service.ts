import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { parseJson, toJson, toConnection, filterByQuery } from '../../common/helpers'
import { mapOrder, mapReturn, mapOrderRisk, mapCustomer } from '../../common/mappers'
import { uid, roundMoney } from '../../common/ids'
import { actorId, actorName } from '../../auth/actor'

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  private async allocateOrderNumber(): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      let row = await tx.shopCounter.findUnique({ where: { id: 'order_number' } })
      if (!row) {
        const orders = await tx.order.findMany({ where: { isDraft: false }, select: { name: true } })
        let maxNum = 1000
        for (const o of orders) {
          const n = Number(String(o.name).replace('#', ''))
          if (Number.isFinite(n) && n < 900000) maxNum = Math.max(maxNum, n)
        }
        row = await tx.shopCounter.create({ data: { id: 'order_number', value: maxNum } })
      }
      const updated = await tx.shopCounter.update({
        where: { id: 'order_number' },
        data: { value: { increment: 1 } },
      })
      return updated.value
    })
  }


  private async riskFor(orderId: string) {
    const r = await this.prisma.orderRisk.findUnique({ where: { orderId } })
    return r ? { level: r.level, signals: parseJson<string[]>(r.signals as string, []) } : null
  }

  async decorateOrders(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    const risks = await this.prisma.orderRisk.findMany()
    const riskMap = new Map(risks.map((r) => [r.orderId, r]))
    return rows.map((o) => mapOrder(o, mapOrderRisk(riskMap.get(o.id as string))))
  }

  async order(id: string): Promise<any> {
    const row = await this.prisma.order.findUnique({ where: { id } })
    if (!row) return null
    return (await this.decorateOrders([row as unknown as Record<string, unknown>]))[0]
  }

  async orders(args: any) {
    let rows = (await this.prisma.order.findMany({ orderBy: { createdAt: 'desc' } })) as unknown as Record<string, unknown>[]
    rows = rows.filter((r) => !r.isDraft)
    if (args.status) rows = rows.filter((r) => r.status === args.status)
    if (args.paymentStatus) rows = rows.filter((r) => r.paymentStatus === args.paymentStatus)
    if (args.fulfillmentStatus) rows = rows.filter((r) => r.fulfillmentStatus === args.fulfillmentStatus)
    rows = filterByQuery(rows, args.query, (r) => {
      const items = parseJson<{ title?: string; sku?: string }[]>(r.lineItems as string, [])
      return [r.name as string, r.email as string, items.map((i) => i.sku ?? '').join(' '), items.map((i) => i.title ?? '').join(' ')]
    })
    if (args.reverse) rows = [...rows].reverse()
    const decorated = await this.decorateOrders(rows)
    return toConnection(decorated, args.first, args.after, args.last, args.before)
  }

  async draftOrders(args: any) {
    let rows = (await this.prisma.order.findMany({ where: { isDraft: true }, orderBy: { createdAt: 'desc' } })) as unknown as Record<string, unknown>[]
    rows = filterByQuery(rows, args.query, (r) => [r.name as string, r.email as string])
    const decorated = await this.decorateOrders(rows)
    return toConnection(decorated, args.first, args.after, args.last, args.before)
  }

  async abandonedCheckouts(first: number) {
    const rows = await this.prisma.abandonedCheckout.findMany({ orderBy: { createdAt: 'desc' }, take: first })
    return rows.map((r) => ({ ...r, lineItems: parseJson<unknown[]>(r.lineItems as string, []) }))
  }

  private async addTimeline(orderId: string, type: string, message: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) return
    const timeline = parseJson<unknown[]>(order.timeline as string, [])
    timeline.push({ id: uid('ev'), createdAt: new Date().toISOString(), type, message, author: actorName() })
    await this.prisma.order.update({ where: { id: orderId }, data: { timeline: toJson(timeline) } })
  }

  private async logActivity(action: string, resource: string, resourceId?: string): Promise<void> {
    await this.prisma.activityEntry.create({
      data: { id: uid('act'), at: new Date(), staffId: actorId(), staffName: actorName(), action, resource, resourceId: resourceId ?? null },
    })
  }

  private recomputeFulfillmentStatus(order: { lineItems: { id: string; requiresShipping: boolean }[]; fulfillments: { lineItemIds: string[] }[] }): string {
    const fulfillable = order.lineItems.filter((li) => li.requiresShipping)
    if (fulfillable.length === 0) return order.lineItems.length > 0 ? 'fulfilled' : 'unfulfilled'
    const fulfilledIds = new Set(order.fulfillments.flatMap((f) => f.lineItemIds))
    const all = fulfillable.every((li) => fulfilledIds.has(li.id))
    const some = fulfillable.some((li) => fulfilledIds.has(li.id))
    return all ? 'fulfilled' : some ? 'partial' : 'unfulfilled'
  }

  private recomputePaymentStatus(order: { status: string; paymentStatus: string; total: number; refunds: { amount: number }[] }): string {
    if (order.status === 'cancelled') return order.paymentStatus
    const refunded = order.refunds.reduce((s, r) => s + r.amount, 0)
    if (refunded === 0) return order.paymentStatus
    return refunded >= order.total - 0.01 ? 'refunded' : 'partially_refunded'
  }

  private async taxFromSettings(opts: {
    taxExempt: boolean
    subtotal: number
    discountAmount: number
    shippingPrice: number
  }): Promise<number> {
    if (opts.taxExempt) return 0
    const settingsRow = await this.prisma.storeSettings.findFirst()
    const settingsVal = settingsRow
      ? parseJson<{ taxes?: { taxRate?: number; chargeTaxOnShipping?: boolean } }>(settingsRow.value as string, {})
      : {}
    const settingsTaxes = settingsVal.taxes ?? {}
    const rate = (settingsTaxes.taxRate ?? 8) / 100
    const taxableBase =
      Math.max(0, opts.subtotal - opts.discountAmount) + (settingsTaxes.chargeTaxOnShipping ? opts.shippingPrice : 0)
    return roundMoney(taxableBase * rate)
  }

  /** Read-only check that enough aggregate available exists before reserving. */
  private async assertCanReserve(variantId: string, quantity: number): Promise<void> {
    const sum = await this.prisma.inventoryLevel.aggregate({
      where: { variantId },
      _sum: { available: true },
    })
    const total = sum._sum.available ?? 0
    if (total < quantity) {
      throw new Error(`Insufficient available stock (has ${total}, needs ${quantity})`)
    }
  }

  /** Move available → committed across locations. Throws if aggregate on-hand is insufficient. */
  private async reserveQuantity(variantId: string, quantity: number, reason: string): Promise<void> {
    const levels = await this.prisma.inventoryLevel.findMany({
      where: { variantId, available: { gt: 0 } },
      orderBy: { available: 'desc' },
    })
    const total = levels.reduce((s, l) => s + l.available, 0)
    if (total < quantity) {
      throw new Error(`Insufficient available stock (has ${total}, needs ${quantity})`)
    }
    let remaining = quantity
    for (const level of levels) {
      if (remaining <= 0) break
      const take = Math.min(level.available, remaining)
      const newAvail = level.available - take
      await this.prisma.inventoryLevel.update({
        where: { variantId_locationId: { variantId: level.variantId, locationId: level.locationId } },
        data: { available: newAvail, committed: level.committed + take },
      })
      await this.prisma.inventoryHistory.create({
        data: {
          id: uid('ih'), variantId: level.variantId, locationId: level.locationId,
          change: -take, resultingAvailable: newAvail, reason, createdAt: new Date(), author: actorName(),
        },
      })
      remaining -= take
    }
  }

  /** Read-only check mirroring consumeForFulfill preconditions. */
  private async assertCanFulfill(variantId: string, quantity: number, locationId: string): Promise<void> {
    const target = await this.prisma.inventoryLevel.findUnique({
      where: { variantId_locationId: { variantId, locationId } },
    })
    if (!target) throw new Error(`No inventory level for variant at location ${locationId}`)
    if (target.committed >= quantity) return
    const sum = await this.prisma.inventoryLevel.aggregate({
      where: { variantId },
      _sum: { committed: true },
    })
    if ((sum._sum.committed ?? 0) > 0) {
      throw new Error(`Insufficient reserved stock at this location (reserved ${target.committed}, needs ${quantity})`)
    }
    if (target.available < quantity) {
      throw new Error(`Insufficient available stock at this location (has ${target.available}, needs ${quantity})`)
    }
  }

  /** Move committed → available at the preferred location, then any remaining elsewhere. */
  private async releaseCommitted(
    variantId: string,
    quantity: number,
    reason: string,
    preferredLocationId?: string,
  ): Promise<void> {
    let remaining = quantity
    const apply = async (locationId: string, committed: number, available: number, rel: number) => {
      const newAvail = available + rel
      await this.prisma.inventoryLevel.update({
        where: { variantId_locationId: { variantId, locationId } },
        data: { committed: committed - rel, available: newAvail },
      })
      await this.prisma.inventoryHistory.create({
        data: {
          id: uid('ih'), variantId, locationId, change: rel,
          resultingAvailable: newAvail, reason, createdAt: new Date(), author: actorName(),
        },
      })
    }
    if (preferredLocationId) {
      const preferred = await this.prisma.inventoryLevel.findUnique({
        where: { variantId_locationId: { variantId, locationId: preferredLocationId } },
      })
      if (preferred && preferred.committed > 0) {
        const rel = Math.min(preferred.committed, remaining)
        await apply(preferredLocationId, preferred.committed, preferred.available, rel)
        remaining -= rel
      }
    }
    while (remaining > 0) {
      const level = await this.prisma.inventoryLevel.findFirst({
        where: { variantId, committed: { gt: 0 } },
      })
      if (!level) break
      const rel = Math.min(level.committed, remaining)
      await apply(level.locationId, level.committed, level.available, rel)
      remaining -= rel
    }
  }

  /**
   * Fulfill consumes reserved units at the ship-from location.
   * Never steals committed from another location and also decrements available here.
   * Legacy (no reservation anywhere): decrement available at the ship-from location only.
   */
  private async consumeForFulfill(
    variantId: string,
    quantity: number,
    locationId: string,
    reason: string,
  ): Promise<void> {
    const target = await this.prisma.inventoryLevel.findUnique({
      where: { variantId_locationId: { variantId, locationId } },
    })
    if (!target) throw new Error(`No inventory level for variant at location ${locationId}`)
    if (target.committed >= quantity) {
      await this.prisma.inventoryLevel.update({
        where: { variantId_locationId: { variantId, locationId } },
        data: { committed: target.committed - quantity },
      })
      await this.prisma.inventoryHistory.create({
        data: {
          id: uid('ih'), variantId, locationId, change: 0,
          resultingAvailable: target.available, reason, createdAt: new Date(), author: actorName(),
        },
      })
      return
    }
    const sum = await this.prisma.inventoryLevel.aggregate({
      where: { variantId },
      _sum: { committed: true },
    })
    if ((sum._sum.committed ?? 0) > 0) {
      throw new Error(`Insufficient reserved stock at this location (reserved ${target.committed}, needs ${quantity})`)
    }
    if (target.available < quantity) {
      throw new Error(`Insufficient available stock at this location (has ${target.available}, needs ${quantity})`)
    }
    const newAvail = target.available - quantity
    await this.prisma.inventoryLevel.update({
      where: { variantId_locationId: { variantId, locationId } },
      data: { available: newAvail },
    })
    await this.prisma.inventoryHistory.create({
      data: {
        id: uid('ih'), variantId, locationId, change: -quantity,
        resultingAvailable: newAvail, reason, createdAt: new Date(), author: actorName(),
      },
    })
  }

  async markAsPaid(id: string): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new Error('Order not found')
    if (order.isDraft) throw new Error('Cannot mark a draft order as paid; convert it first')
    if (order.status === 'cancelled') throw new Error('Cannot mark a cancelled order as paid')
    if (['paid', 'partially_refunded', 'refunded'].includes(order.paymentStatus)) {
      throw new Error('Order payment has already been captured or refunded')
    }
    const priorRefunds = parseJson<{ amount: number }[]>(order.refunds as string, [])
    if (priorRefunds.length > 0) throw new Error('Cannot mark as paid after refunds have been issued')
    await this.prisma.order.update({ where: { id }, data: { paymentStatus: 'paid' } })
    const fee = roundMoney(order.total * 0.029 + 0.3)
    await this.prisma.balanceTransaction.create({
      data: {
        id: uid('txn'),
        type: 'charge',
        amount: order.total,
        fee,
        net: roundMoney(order.total - fee),
        orderId: order.id,
        description: `Payment for ${order.name}`,
        payoutId: null,
        at: new Date(),
      },
    })
    await this.addTimeline(id, 'payment', `Payment of $${order.total.toFixed(2)} captured via ${order.paymentGateway}`)
    await this.logActivity('Marked order as paid', 'order', id)
    return this.order(id)
  }

  async cancel(id: string, restock = true): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new Error('Order not found')
    if (order.isDraft) throw new Error('Cannot cancel a draft order')
    if (order.status === 'cancelled') throw new Error('Order is already cancelled')
    const lineItems = parseJson<{ id: string; variantId: string; quantity: number }[]>(order.lineItems as string, [])
    if (restock && order.fulfillmentStatus !== 'fulfilled') {
      for (const li of lineItems) {
        await this.releaseCommitted(li.variantId, li.quantity, `Cancel release ${order.name}`)
      }
    }
    const refunds = parseJson<{ id: string; createdAt: string; amount: number; reason: string; lineItemIds: string[]; restock: boolean }[]>(order.refunds as string, [])
    const already = refunds.reduce((s, r) => s + r.amount, 0)
    const remainingToRefund = roundMoney(Math.max(0, order.total - already))
    const captured = order.paymentStatus === 'paid' || order.paymentStatus === 'partially_refunded'
    if (captured && remainingToRefund > 0) {
      refunds.push({
        id: uid('rf'),
        createdAt: new Date().toISOString(),
        amount: remainingToRefund,
        reason: 'Order cancelled',
        lineItemIds: lineItems.map((li) => li.id),
        restock,
      })
      await this.prisma.balanceTransaction.create({
        data: {
          id: uid('txn'),
          type: 'refund',
          amount: -remainingToRefund,
          fee: 0,
          net: -remainingToRefund,
          orderId: order.id,
          description: `Cancel refund for ${order.name}`,
          payoutId: null,
          at: new Date(),
        },
      })
    }
    await this.prisma.order.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        paymentStatus: captured ? 'refunded' : order.paymentStatus === 'pending' ? 'voided' : order.paymentStatus,
        refunds: toJson(refunds),
      },
    })
    await this.addTimeline(id, 'cancel', `Order cancelled${restock ? ' · items restocked' : ''}`)
    await this.logActivity('Cancelled order', 'order', id)
    return this.order(id)
  }

  async close(id: string): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new Error('Order not found')
    if (order.isDraft) throw new Error('Cannot close a draft order')
    if (order.status === 'cancelled') throw new Error('Cannot close a cancelled order')
    if (order.status === 'closed') throw new Error('Order is already closed')
    await this.prisma.order.update({ where: { id }, data: { status: 'closed', closedAt: new Date() } })
    await this.addTimeline(id, 'edit', 'Order archived')
    return this.order(id)
  }

  async reopen(id: string): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new Error('Order not found')
    if (order.isDraft) throw new Error('Cannot reopen a draft order')
    if (order.status === 'cancelled') throw new Error('Cannot reopen a cancelled order')
    if (order.status === 'open') throw new Error('Order is already open')
    await this.prisma.order.update({ where: { id }, data: { status: 'open', closedAt: null } })
    await this.addTimeline(id, 'edit', 'Order unarchived')
    return this.order(id)
  }


  async update(id: string, input: any): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new Error('Order not found')
    const data: Record<string, unknown> = {}
    if (input.tags !== undefined) data.tags = toJson(input.tags)
    if (input.note !== undefined) {
      data.note = input.note
      await this.addTimeline(id, 'note', input.note)
    }
    await this.prisma.order.update({ where: { id }, data })
    return this.order(id)
  }

  async fulfill(input: any): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id: input.orderId } })
    if (!order) throw new Error('Order not found')
    if (order.isDraft) throw new Error('Cannot fulfill a draft order')
    if (order.status === 'cancelled') throw new Error('Cannot fulfill a cancelled order')
    if (order.status === 'closed') throw new Error('Cannot fulfill a closed order')
    if (order.paymentStatus === 'refunded') throw new Error('Cannot fulfill a refunded order')
    if (order.fulfillmentStatus === 'fulfilled') throw new Error('Order is already fulfilled')
    const lineItems = parseJson<{ id: string; variantId: string; quantity: number }[]>(order.lineItems as string, [])
    const fulfillments = parseJson<{ id: string; createdAt: string; lineItemIds: string[]; trackingNumber?: string; carrier?: string; locationId: string; status: string }[]>(order.fulfillments as string, [])
    const alreadyFulfilled = new Set(fulfillments.flatMap((f) => f.lineItemIds))
    for (const lid of input.lineItemIds) {
      if (alreadyFulfilled.has(lid)) throw new Error(`Line item ${lid} is already fulfilled`)
    }
    for (const li of lineItems) {
      if (!input.lineItemIds.includes(li.id)) continue
      await this.assertCanFulfill(li.variantId, li.quantity, input.locationId)
    }
    for (const li of lineItems) {
      if (!input.lineItemIds.includes(li.id)) continue
      await this.consumeForFulfill(li.variantId, li.quantity, input.locationId, `Fulfilled order ${order.name}`)
    }

    fulfillments.push({
      id: uid('ff'),
      createdAt: new Date().toISOString(),
      lineItemIds: input.lineItemIds,
      trackingNumber: input.trackingNumber || undefined,
      carrier: input.carrier || undefined,
      locationId: input.locationId,
      status: 'success',
    })
    const newFulfillmentStatus = this.recomputeFulfillmentStatus({ lineItems: lineItems as never, fulfillments: fulfillments as never })
    const data: Record<string, unknown> = { fulfillments: toJson(fulfillments), fulfillmentStatus: newFulfillmentStatus }
    if (newFulfillmentStatus === 'fulfilled') {
      data.status = 'closed'
      data.closedAt = new Date()
    }
    await this.prisma.order.update({ where: { id: order.id }, data })
    const location = await this.prisma.location.findUnique({ where: { id: input.locationId } })
    const qty = lineItems.filter((li) => input.lineItemIds.includes(li.id)).reduce((s, li) => s + li.quantity, 0)
    const tracking = input.trackingNumber ? ` · Tracking ${input.carrier ?? ''} ${input.trackingNumber}` : ''
    await this.addTimeline(
      order.id,
      'fulfillment',
      `${qty} item(s) fulfilled from ${location?.name ?? 'default location'}${tracking}${input.notifyCustomer ? ' · Customer notified' : ''}`,
    )
    await this.logActivity('Fulfilled order', 'order', order.id)
    return this.order(order.id)
  }

  async refund(input: any): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id: input.orderId } })
    if (!order) throw new Error('Order not found')
    if (order.isDraft) throw new Error('Cannot refund a draft order')
    if (order.status === 'cancelled') throw new Error('Cannot refund a cancelled order')
    if (!['paid', 'partially_refunded'].includes(order.paymentStatus)) {
      throw new Error('Refunds are only allowed for paid or partially refunded orders')
    }
    if (input.amount <= 0) throw new Error('Refund amount must be greater than 0')
    const refunds = parseJson<{ id: string; createdAt: string; amount: number; reason: string; lineItemIds: string[]; restock: boolean }[]>(order.refunds as string, [])
    const already = refunds.reduce((s, r) => s + r.amount, 0)
    if (already + input.amount > order.total + 0.01) throw new Error('Refund exceeds order total')

    let lineItems = parseJson<{ id: string; variantId: string; price: number; quantity: number; restockedQty?: number }[]>(order.lineItems as string, [])
    const fulfillments = parseJson<{ id: string; locationId: string; lineItemIds: string[] }[]>(order.fulfillments as string, [])

    if (input.restock) {
      for (let i = 0; i < lineItems.length; i++) {
        const li = lineItems[i]
        if (!input.lineItemIds.includes(li.id)) continue
        const alreadyRestocked = li.restockedQty ?? 0
        const unitsToRestock = li.quantity - alreadyRestocked
        if (unitsToRestock <= 0) continue

        const fulfillment = fulfillments.find((f) => f.lineItemIds.includes(li.id))
        if (fulfillment) {
          const level = await this.prisma.inventoryLevel.findUnique({
            where: { variantId_locationId: { variantId: li.variantId, locationId: fulfillment.locationId } },
          })
          if (level) {
            const newAvail = level.available + unitsToRestock
            await this.prisma.inventoryLevel.update({
              where: { variantId_locationId: { variantId: level.variantId, locationId: level.locationId } },
              data: { available: newAvail },
            })
            await this.prisma.inventoryHistory.create({
              data: { id: uid('ih'), variantId: level.variantId, locationId: level.locationId, change: unitsToRestock, resultingAvailable: newAvail, reason: `Refund restock ${order.name}`, createdAt: new Date(), author: actorName() },
            })
          }
        } else {
          await this.releaseCommitted(li.variantId, unitsToRestock, `Refund release ${order.name}`)
        }
        lineItems[i] = { ...li, restockedQty: alreadyRestocked + unitsToRestock }
      }
    }

    const refundAmount = roundMoney(input.amount)
    refunds.push({
      id: uid('rf'),
      createdAt: new Date().toISOString(),
      amount: refundAmount,
      reason: input.reason,
      lineItemIds: input.lineItemIds,
      restock: input.restock ?? false,
    })
    const paymentStatus = this.recomputePaymentStatus({
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: order.total,
      refunds: refunds as never,
    })
    const data: Record<string, unknown> = { refunds: toJson(refunds), paymentStatus, lineItems: toJson(lineItems) }
    if (paymentStatus === 'refunded' && order.fulfillmentStatus === 'unfulfilled') {
      data.fulfillmentStatus = 'returned'
      data.status = 'closed'
      data.closedAt = new Date()
    }
    await this.prisma.order.update({ where: { id: order.id }, data })
    await this.prisma.balanceTransaction.create({
      data: {
        id: uid('txn'),
        type: 'refund',
        amount: -refundAmount,
        fee: 0,
        net: -refundAmount,
        orderId: order.id,
        description: `Refund for ${order.name}`,
        payoutId: null,
        at: new Date(),
      },
    })
    await this.addTimeline(
      order.id,
      'refund',
      `Refund of $${refundAmount.toFixed(2)} issued (${input.reason})${input.restock ? ' · items restocked' : ''}`,
    )
    await this.logActivity('Refunded order', 'order', order.id)
    return this.order(order.id)
  }

  async orderEdit(id: string, added: any, removed: any): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new Error('Order not found')
    if (order.status !== 'open' || order.fulfillmentStatus !== 'unfulfilled') throw new Error('Only unfulfilled orders can be edited')

    let lineItems = parseJson<Record<string, any>[]>(order.lineItems as string, [])

    let projected = lineItems.map((li) => ({ ...li }))
    for (const rem of removed) {
      projected = projected
        .map((li) => (li.id === rem.lineItemId ? { ...li, quantity: li.quantity - rem.quantity } : li))
        .filter((li) => li.quantity > 0)
    }
    for (const add of added) {
      const existing = projected.find((li) => li.variantId === add.variantId)
      if (existing) {
        projected = projected.map((li) =>
          li.variantId === add.variantId ? { ...li, quantity: li.quantity + add.quantity } : li,
        )
      } else {
        projected.push({ variantId: add.variantId, quantity: add.quantity })
      }
    }
    if (projected.length === 0) throw new Error('An order needs at least one item')

    const company = await this.prisma.company.findFirst({ where: { customerId: order.customerId } })
    const priceMultiplier = company && company.priceListDiscountPercent > 0 ? Math.max(0, 1 - company.priceListDiscountPercent / 100) : 1

    for (const add of added) {
      const variantProduct = await this.prisma.product.findFirst({
        where: { variants: { array_contains: [{ id: add.variantId }] } },
      })
      if (!variantProduct) throw new Error('Variant no longer exists')
      const variants = parseJson<Record<string, any>[]>(variantProduct.variants as string, [])
      if (!variants.find((v) => v.id === add.variantId)) throw new Error('Variant no longer exists')
      await this.assertCanReserve(add.variantId, add.quantity)
    }

    for (const rem of removed) {
      const existing = lineItems.find((li) => li.id === rem.lineItemId)
      if (existing) {
        await this.releaseCommitted(existing.variantId, rem.quantity, `Order edit removal ${order.name}`)
      }
      lineItems = lineItems
        .map((li) => (li.id === rem.lineItemId ? { ...li, quantity: li.quantity - rem.quantity } : li))
        .filter((li) => li.quantity > 0)
    }
    for (const add of added) {
      const variantProduct = await this.prisma.product.findFirst({
        where: { variants: { array_contains: [{ id: add.variantId }] } },
      })
      if (!variantProduct) throw new Error('Variant no longer exists')
      const variants = parseJson<Record<string, any>[]>(variantProduct.variants as string, [])
      const variant = variants.find((v) => v.id === add.variantId)
      if (!variant) throw new Error('Variant no longer exists')

      await this.reserveQuantity(add.variantId, add.quantity, `Order edit addition ${order.name}`)

      const existing = lineItems.find((li) => li.variantId === add.variantId)
      if (existing) {
        lineItems = lineItems.map((li) => (li.variantId === add.variantId ? { ...li, quantity: li.quantity + add.quantity } : li))
      } else {
        lineItems.push({
          id: uid('li'),
          productId: variantProduct.id,
          variantId: variant.id,
          title: variantProduct.title,
          variantTitle: variant.title === 'Default Title' ? '' : variant.title,
          sku: variant.sku,
          quantity: add.quantity,
          price: roundMoney(variant.price * priceMultiplier),
          totalDiscount: 0,
          requiresShipping: true,
          imageSrc: parseJson<{ src?: string }[]>(variantProduct.media as string, [])[0]?.src,
        })
      }
    }

    const subtotal = roundMoney(lineItems.reduce((s, li) => s + li.price * li.quantity - (li.totalDiscount ?? 0), 0))
    const discountObj = parseJson<{ code: string; amount: number } | null>(order.discountCode as string, null)
    const rawDiscountAmount = discountObj?.amount ?? 0
    const discountAmount = Math.min(subtotal, Math.max(0, rawDiscountAmount))
    const customer = await this.prisma.customer.findUnique({ where: { id: order.customerId } })
    const taxTotal = await this.taxFromSettings({
      taxExempt: Boolean(customer?.taxExempt),
      subtotal,
      discountAmount,
      shippingPrice: order.shippingPrice,
    })
    const total = roundMoney(Math.max(0, subtotal - discountAmount) + order.shippingPrice + taxTotal)
    const delta = roundMoney(total - order.total)
    await this.prisma.order.update({
      where: { id },
      data: { lineItems: toJson(lineItems), subtotal, taxTotal, total },
    })
    await this.prisma.orderEdit.create({
      data: {
        id: uid('oe'),
        orderId: id,
        at: new Date(),
        author: actorName(),
        added: toJson(added),
        removed: toJson(removed),
        deltaTotal: delta,
      },
    })
    const parts: string[] = []
    if (added.length) parts.push(`added ${added.reduce((s: number, a: any) => s + a.quantity, 0)} item(s)`)
    if (removed.length) parts.push(`removed ${removed.reduce((s: number, r: any) => s + r.quantity, 0)} item(s)`)
    await this.addTimeline(id, 'edit', `Order edited — ${parts.join(', ')} · total ${delta >= 0 ? '+' : '−'}$${Math.abs(delta).toFixed(2)}`)
    await this.logActivity('Edited order', 'order', id)
    return this.order(id)
  }

  // returns
  async returnsForOrder(orderId: string) {
    const rows = await this.prisma.returnRecord.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' } })
    return rows.map(mapReturn)
  }

  async createReturn(input: any): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id: input.orderId } })
    if (!order) throw new Error('Order not found')
    if (input.lines.length === 0) throw new Error('Select at least one item to return')
    const refundAmount = roundMoney(input.refundAmount ?? 0)
    if (refundAmount > 0) {
      const refunds = parseJson<{ amount: number }[]>(order.refunds as string, [])
      const already = refunds.reduce((s, r) => s + r.amount, 0)
      if (already + refundAmount > order.total + 0.01) throw new Error('Refund exceeds order total')
    }
    const record = await this.prisma.returnRecord.create({
      data: {
        id: uid('ret'),
        orderId: input.orderId,
        status: 'open',
        lines: toJson(input.lines),
        reason: input.reason,
        restock: input.restock ?? true,
        refundAmount,
      },
    })
    await this.addTimeline(input.orderId, 'refund', `Return requested for ${input.lines.reduce((s: number, l: any) => s + l.quantity, 0)} item(s) (${input.reason})`)
    await this.logActivity('Created return', 'order', input.orderId)
    return mapReturn(record as unknown as Record<string, unknown>)
  }

  async closeReturn(id: string, markRefunded: boolean): Promise<any> {
    const ret = await this.prisma.returnRecord.findUnique({ where: { id } })
    if (!ret || ret.status !== 'open') throw new Error('Return not found or already closed')
    const order = await this.prisma.order.findUnique({ where: { id: ret.orderId } })
    if (!order) throw new Error('Order not found')
    const lines = parseJson<{ lineItemId: string; quantity: number }[]>(ret.lines as string, [])
    const fulfillments = parseJson<{ id: string; locationId: string; lineItemIds: string[] }[]>(order.fulfillments as string, [])
    let lineItems = parseJson<{ id: string; variantId: string; quantity: number; restockedQty?: number }[]>(order.lineItems as string, [])

    if (ret.restock) {
      for (const line of lines) {
        const liIndex = lineItems.findIndex((x) => x.id === line.lineItemId)
        if (liIndex < 0) continue
        const li = lineItems[liIndex]
        const alreadyRestocked = li.restockedQty ?? 0
        const unitsToRestock = Math.min(line.quantity, li.quantity - alreadyRestocked)
        if (unitsToRestock <= 0) continue

        const fulfillment = fulfillments.find((f) => f.lineItemIds.includes(li.id))
        if (fulfillment) {
          const level = await this.prisma.inventoryLevel.findUnique({
            where: { variantId_locationId: { variantId: li.variantId, locationId: fulfillment.locationId } },
          })
          if (level) {
            const newAvail = level.available + unitsToRestock
            await this.prisma.inventoryLevel.update({
              where: { variantId_locationId: { variantId: level.variantId, locationId: level.locationId } },
              data: { available: newAvail },
            })
            await this.prisma.inventoryHistory.create({
              data: { id: uid('ih'), variantId: level.variantId, locationId: level.locationId, change: unitsToRestock, resultingAvailable: newAvail, reason: `Return restock ${order.name}`, createdAt: new Date(), author: actorName() },
            })
          }
        } else {
          await this.releaseCommitted(li.variantId, unitsToRestock, `Return release ${order.name}`)
        }
        lineItems[liIndex] = { ...li, restockedQty: alreadyRestocked + unitsToRestock }
      }
    }

    const refundAmount = ret.refundAmount
    const orderUpdate: Record<string, unknown> = { lineItems: toJson(lineItems) }
    if (markRefunded && refundAmount > 0) {
      if (!['paid', 'partially_refunded'].includes(order.paymentStatus)) {
        throw new Error('Refunds are only allowed for paid or partially refunded orders')
      }
      const refunds = parseJson<{ id: string; createdAt: string; amount: number; reason: string; lineItemIds: string[]; restock: boolean }[]>(order.refunds as string, [])
      const already = refunds.reduce((s, r) => s + r.amount, 0)
      if (already + refundAmount > order.total + 0.01) throw new Error('Refund exceeds order total')
      refunds.push({ id: uid('rf'), createdAt: new Date().toISOString(), amount: refundAmount, reason: ret.reason, lineItemIds: lines.map((l) => l.lineItemId), restock: false })
      const refundedAll = lineItems.every((li) => lines.some((l) => l.lineItemId === li.id && l.quantity >= li.quantity))
      const paymentStatus = this.recomputePaymentStatus({ status: order.status, paymentStatus: order.paymentStatus, total: order.total, refunds: refunds as never })
      orderUpdate.refunds = toJson(refunds)
      orderUpdate.paymentStatus = paymentStatus
      if (refundedAll) orderUpdate.fulfillmentStatus = 'returned'
      await this.prisma.balanceTransaction.create({
        data: {
          id: uid('txn'),
          type: 'refund',
          amount: -refundAmount,
          fee: 0,
          net: -refundAmount,
          orderId: order.id,
          description: `Return refund for ${order.name}`,
          payoutId: null,
          at: new Date(),
        },
      })
    }
    await this.prisma.order.update({ where: { id: order.id }, data: orderUpdate })

    await this.prisma.returnRecord.update({ where: { id }, data: { status: 'returned', closedAt: new Date() } })
    await this.addTimeline(
      order.id,
      'refund',
      `Return closed — ${markRefunded && refundAmount > 0 ? `$${refundAmount.toFixed(2)} refunded` : 'no refund issued'}${ret.restock ? ' · items restocked' : ''}`,
    )
    await this.logActivity('Closed return', 'order', order.id)
    const updated: any = await this.prisma.returnRecord.findUnique({ where: { id } })
    return mapReturn(updated)
  }

  // abandoned checkouts
  async sendRecoveryEmail(id: string): Promise<any> {
    const co = await this.prisma.abandonedCheckout.findUnique({ where: { id } })
    if (!co) throw new Error('Checkout not found')
    await this.prisma.abandonedCheckout.update({ where: { id }, data: { recoveryStatus: 'email_sent' } })
    const updated = await this.prisma.abandonedCheckout.findUnique({ where: { id } })
    return { ...updated, lineItems: parseJson<unknown[]>(updated!.lineItems as string, []) }
  }

  async convertAbandoned(id: string): Promise<any> {
    const co = await this.prisma.abandonedCheckout.findUnique({ where: { id } })
    if (!co) throw new Error('Checkout not found')
    if (co.recoveryStatus === 'recovered') throw new Error('Checkout already recovered')
    const items = parseJson<{ variantId: string; quantity: number }[]>(co.lineItems as string, [])
    const draft = await this.createDraft({ customerId: co.customerId, items, note: undefined, tags: [] })
    try {
      const order = await this.convertDraft(draft.id as string)
      await this.prisma.abandonedCheckout.update({ where: { id }, data: { recoveryStatus: 'recovered' } })
      return order
    } catch (e) {
      await this.prisma.order.deleteMany({ where: { id: draft.id as string, isDraft: true } })
      throw e
    }
  }

  // drafts


  private assertDiscountEligible(
    disc: { customerEligibility: string; productEligibility: string; productIds: unknown },
    customer: { emailMarketingConsent?: unknown },
    lineItems: { productId: string }[],
  ): void {
    const custElig = disc.customerEligibility ?? 'all'
    if (custElig === 'email_subscribers') {
      const consent = parseJson<{ state?: string }>(customer.emailMarketingConsent as string, {})
      if (consent.state !== 'subscribed') {
        throw new Error('This discount is only available to email subscribers')
      }
    } else if (custElig !== 'all') {
      throw new Error('You are not eligible for this discount')
    }

    const prodElig = disc.productEligibility ?? 'all'
    if (prodElig === 'specific') {
      const allowed = new Set(parseJson<string[]>(disc.productIds as string, []))
      if (!lineItems.some((li) => allowed.has(li.productId))) {
        throw new Error('This discount does not apply to any items in this order')
      }
    }
  }

  private discountEligibleSubtotal(
    disc: { productEligibility: string; productIds: unknown },
    lineItems: { productId: string; price: number; quantity: number }[],
    subtotal: number,
  ): number {
    if ((disc.productEligibility ?? 'all') !== 'specific') return subtotal
    const allowed = new Set(parseJson<string[]>(disc.productIds as string, []))
    return roundMoney(
      lineItems
        .filter((li) => allowed.has(li.productId))
        .reduce((sum, li) => sum + li.price * li.quantity, 0),
    )
  }

  private async buildDraftComputation(input: any) {
    const shippingPrice = input.shippingPrice ?? 6.99
    if (shippingPrice < 0) throw new Error('Shipping price cannot be negative')
    if ((input.discountAmount ?? 0) < 0) throw new Error('Discount amount cannot be negative')
    const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId } })
    if (!customer) throw new Error('Select a customer')

    const company = await this.prisma.company.findFirst({ where: { customerId: customer.id } })
    const priceMultiplier = company && company.priceListDiscountPercent > 0 ? Math.max(0, 1 - company.priceListDiscountPercent / 100) : 1

    const lineItems: Record<string, unknown>[] = []
    for (const li of input.items) {
      const product = await this.prisma.product.findFirst({ where: { variants: { array_contains: [{ id: li.variantId }] } } })
      if (!product) throw new Error('Invalid variant in draft')
      const variant = parseJson<Record<string, any>[]>(product.variants as string, []).find((v) => v.id === li.variantId)
      if (!variant) throw new Error('Invalid variant')
      const unitPrice = roundMoney(variant.price * priceMultiplier)
      lineItems.push({
        id: uid('li'),
        productId: product.id,
        variantId: variant.id,
        title: product.title,
        variantTitle: variant.title === 'Default Title' ? '' : variant.title,
        sku: variant.sku,
        quantity: li.quantity,
        price: unitPrice,
        totalDiscount: 0,
        requiresShipping: true,
        imageSrc: parseJson<{ src?: string }[]>(product.media as string, [])[0]?.src,
      })
    }
    const addr: Record<string, unknown> =
      (parseJson<Record<string, unknown>>(customer.defaultAddress, {}) as Record<string, unknown>) ?? {
        firstName: customer.firstName, lastName: customer.lastName, address1: '', city: '', province: '', country: '', zip: '',
      }
    const subtotal = roundMoney(lineItems.reduce((s: number, li: any) => s + li.price * li.quantity, 0))

    let discountAmount = input.discountAmount ?? 0
    let discountCodeObj: { code: string; amount: number } | null = null
    const rawCode = input.discountCode || (input.code ? String(input.code).trim().toUpperCase() : null)
    if (rawCode && rawCode !== 'CUSTOM') {
      const disc = await this.prisma.discount.findUnique({ where: { code: rawCode.toUpperCase() } })
      if (!disc || disc.status !== 'active') throw new Error(`Discount code ${rawCode} is invalid or inactive`)
      const now = new Date()
      if (disc.startsAt && now < disc.startsAt) throw new Error(`Discount code ${rawCode} is not yet active`)
      if (disc.endsAt && now > disc.endsAt) throw new Error(`Discount code ${rawCode} has expired`)
      if (disc.usageLimit !== null && disc.usedCount >= disc.usageLimit) {
        throw new Error(`Discount code ${rawCode} has reached its usage limit`)
      }
      if (disc.minPurchase !== null && subtotal < disc.minPurchase) {
        throw new Error(`Minimum purchase of $${disc.minPurchase.toFixed(2)} required for discount ${rawCode}`)
      }
      this.assertDiscountEligible(disc, customer, lineItems as { productId: string }[])
      const eligibleSubtotal = this.discountEligibleSubtotal(
        disc,
        lineItems as { productId: string; price: number; quantity: number }[],
        subtotal,
      )
      if (disc.type === 'percentage') {
        const pct = Math.min(100, Math.max(0, disc.value ?? 0))
        discountAmount = roundMoney(eligibleSubtotal * (pct / 100))
      } else if (disc.type === 'fixed_amount') {
        discountAmount = Math.min(eligibleSubtotal, roundMoney(Math.max(0, disc.value ?? 0)))
      } else if (disc.type === 'free_shipping' || disc.type === 'bxgy') {
        throw new Error(`Discount code ${rawCode} is not supported on draft orders`)
      } else {
        throw new Error(`Discount code ${rawCode} has an unsupported type`)
      }
      discountCodeObj = { code: disc.code, amount: discountAmount }
    } else if (discountAmount > 0) {
      if (discountAmount > subtotal + 0.01) throw new Error('Discount amount exceeds subtotal')
      discountCodeObj = { code: 'CUSTOM', amount: roundMoney(discountAmount) }
    }

    const taxTotal = await this.taxFromSettings({
      taxExempt: Boolean(customer.taxExempt),
      subtotal,
      discountAmount,
      shippingPrice,
    })

    return {
      customer,
      lineItems,
      addr,
      subtotal,
      taxTotal,
      discountAmount,
      discountCodeObj,
      shippingPrice,
      total: roundMoney(Math.max(0, subtotal - discountAmount) + shippingPrice + taxTotal),
    }
  }
  async calculateDraft(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const computed = await this.buildDraftComputation(input)
    return {
      subtotal: computed.subtotal,
      taxTotal: computed.taxTotal,
      shippingPrice: computed.shippingPrice,
      totalDiscount: computed.discountAmount,
      total: computed.total,
      lineItems: computed.lineItems,
      customer: mapCustomer(computed.customer as unknown as Record<string, unknown>),
      shippingAddress: computed.addr,
      billingAddress: computed.addr,
      discountCode: computed.discountCodeObj,
    }
  }


  async createDraft(input: any): Promise<any> {
    const computed = await this.buildDraftComputation(input)
    const { customer, lineItems, addr, subtotal, taxTotal, discountCodeObj, shippingPrice, total } = computed
    const now = new Date()
    const order = await this.prisma.order.create({
      data: {
        id: uid('o'),
        name: `#D${Math.floor(Math.random() * 900 + 100)}`,
        customerId: customer.id,
        email: customer.email,
        createdAt: now,
        paymentStatus: 'unpaid',
        fulfillmentStatus: 'unfulfilled',
        status: 'draft',
        channel: 'Online Store',
        lineItems: toJson(lineItems),
        shippingAddress: toJson(addr),
        billingAddress: toJson(addr),
        shippingTitle: shippingPrice === 0 ? 'Free shipping' : 'Standard shipping',
        shippingPrice,
        subtotal,
        taxTotal,
        total,
        discountCode: discountCodeObj ? toJson(discountCodeObj) : null,
        currency: 'USD',
        tags: toJson(input.tags ?? []),
        note: input.note ?? null,
        timeline: toJson([{ id: uid('ev'), createdAt: now.toISOString(), type: 'created', message: 'Draft order created', author: actorName() }]),
        fulfillments: toJson([]),
        refunds: toJson([]),
        isDraft: true,
      },
    })
    await this.logActivity('Created draft order', 'order', order.id)
    return this.order(order.id)
  }

  async updateDraft(id: string, input: any) {
    const existing = await this.prisma.order.findUnique({ where: { id } })
    if (!existing || !existing.isDraft) throw new Error('Draft not found')
    const computed = await this.buildDraftComputation(input)
    const { customer, lineItems, addr, subtotal, taxTotal, discountCodeObj, shippingPrice, total } = computed
    await this.prisma.order.update({
      where: { id },
      data: {
        lineItems: toJson(lineItems),
        subtotal,
        taxTotal,
        total,
        customerId: customer.id,
        email: customer.email,
        shippingAddress: toJson(addr),
        billingAddress: toJson(addr),
        shippingPrice,
        shippingTitle: shippingPrice === 0 ? 'Free shipping' : 'Standard shipping',
        discountCode: discountCodeObj ? toJson(discountCodeObj) : null,
        note: input.note ?? null,
        tags: toJson(input.tags ?? []),
      },
    })
    return this.order(id)
  }

  async deleteDrafts(ids: string[]): Promise<string[]> {
    await this.prisma.order.deleteMany({ where: { id: { in: ids }, isDraft: true } })
    return ids
  }

  async convertDraft(id: string): Promise<any> {
    const draft = await this.prisma.order.findUnique({ where: { id } })
    if (!draft || !draft.isDraft) throw new Error('Draft not found')
    const lineItems = parseJson<{ id: string; variantId: string; quantity: number }[]>(draft.lineItems as string, [])

    // Discount usage must be checked before any stock is reserved (no partial commit).
    const discountRef = parseJson<{ code?: string } | null>(draft.discountCode as string, null)
    if (discountRef?.code && discountRef.code !== 'CUSTOM') {
      const disc = await this.prisma.discount.findUnique({ where: { code: discountRef.code } })
      if (disc && disc.usageLimit !== null && disc.usedCount >= disc.usageLimit) {
        throw new Error(`Discount code ${disc.code} has reached its usage limit`)
      }
    }

    const needed = new Map<string, number>()
    for (const li of lineItems) {
      needed.set(li.variantId, (needed.get(li.variantId) ?? 0) + li.quantity)
    }
    for (const [variantId, qty] of needed) {
      await this.assertCanReserve(variantId, qty)
    }
    for (const [variantId, qty] of needed) {
      await this.reserveQuantity(variantId, qty, `Reserved for order ${draft.name}`)
    }

    if (discountRef?.code && discountRef.code !== 'CUSTOM') {
      const disc = await this.prisma.discount.findUnique({ where: { code: discountRef.code } })
      if (disc) {
        await this.prisma.discount.update({ where: { code: disc.code }, data: { usedCount: { increment: 1 } } })
      }
    }
    const next = await this.allocateOrderNumber()

    await this.prisma.order.update({
      where: { id },
      data: {
        name: `#${next}`,
        status: 'open',
        isDraft: false,
        paymentStatus: 'pending',
        createdAt: new Date(),
      },
    })
    await this.addTimeline(id, 'created', `Draft converted to order #${next}`)
    await this.logActivity('Converted draft to order', 'order', id)
    return this.order(id)
  }

  async sendInvoice(id: string) {
    const draft: any = await this.prisma.order.findUnique({ where: { id } })
    if (!draft || !draft.isDraft) throw new Error('Draft not found')
    await this.addTimeline(id, 'note', `Invoice emailed to ${draft.email}`)
    await this.logActivity('Sent draft invoice', 'order', id)
    return this.order(id)
  }
}

