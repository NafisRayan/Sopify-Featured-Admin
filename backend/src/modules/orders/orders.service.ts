import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { parseJson, toJson, toConnection, filterByQuery } from '../../common/helpers'
import { mapOrder, mapReturn, mapOrderRisk } from '../../common/mappers'
import { uid, roundMoney } from '../../common/ids'

const TAX_RATE = 0.08

function author(): string {
  return 'Ava Chen'
}

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

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
    return toConnection(decorated, args.first, args.after)
  }

  async draftOrders(args: any) {
    let rows = (await this.prisma.order.findMany({ where: { isDraft: true }, orderBy: { createdAt: 'desc' } })) as unknown as Record<string, unknown>[]
    rows = filterByQuery(rows, args.query, (r) => [r.name as string, r.email as string])
    const decorated = await this.decorateOrders(rows)
    return toConnection(decorated, args.first, args.after)
  }

  async abandonedCheckouts(first: number) {
    const rows = await this.prisma.abandonedCheckout.findMany({ orderBy: { createdAt: 'desc' }, take: first })
    return rows.map((r) => ({ ...r, lineItems: parseJson<unknown[]>(r.lineItems as string, []) }))
  }

  private async addTimeline(orderId: string, type: string, message: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) return
    const timeline = parseJson<unknown[]>(order.timeline as string, [])
    timeline.push({ id: uid('ev'), createdAt: new Date().toISOString(), type, message, author: author() })
    await this.prisma.order.update({ where: { id: orderId }, data: { timeline: toJson(timeline) } })
  }

  private async logActivity(action: string, resource: string, resourceId?: string): Promise<void> {
    await this.prisma.activityEntry.create({
      data: { id: uid('act'), at: new Date(), staffId: 'staff_owner', staffName: author(), action, resource, resourceId: resourceId ?? null },
    })
  }

  private recomputeFulfillmentStatus(order: { lineItems: { id: string; requiresShipping: boolean }[]; fulfillments: { lineItemIds: string[] }[] }): string {
    const fulfillable = order.lineItems.filter((li) => li.requiresShipping)
    if (fulfillable.length === 0) return 'unfulfilled'
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

  async markAsPaid(id: string): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new Error('Order not found')
    await this.prisma.order.update({ where: { id }, data: { paymentStatus: 'paid' } })
    await this.addTimeline(id, 'payment', `Payment of $${order.total.toFixed(2)} captured via ${order.paymentGateway}`)
    await this.logActivity('Marked order as paid', 'order', id)
    return this.order(id)
  }

  async cancel(id: string, restock = true): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new Error('Order not found')
    const lineItems = parseJson<{ variantId: string; quantity: number }[]>(order.lineItems as string, [])
    if (restock && order.fulfillmentStatus !== 'fulfilled') {
      for (const li of lineItems) {
        const level = await this.prisma.inventoryLevel.findFirst({ where: { variantId: li.variantId } })
        if (level) {
          const release = Math.min(level.committed, li.quantity)
          await this.prisma.inventoryLevel.update({
            where: { variantId_locationId: { variantId: level.variantId, locationId: level.locationId } },
            data: { committed: level.committed - release, available: level.available + release },
          })
        }
      }
    }
    await this.prisma.order.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        paymentStatus: order.paymentStatus === 'paid' ? 'refunded' : order.paymentStatus === 'pending' ? 'voided' : order.paymentStatus,
      },
    })
    await this.addTimeline(id, 'cancel', `Order cancelled${restock ? ' · items restocked' : ''}`)
    await this.logActivity('Cancelled order', 'order', id)
    return this.order(id)
  }

  async close(id: string): Promise<any> {
    await this.prisma.order.update({ where: { id }, data: { status: 'closed', closedAt: new Date() } })
    await this.addTimeline(id, 'edit', 'Order archived')
    return this.order(id)
  }

  async reopen(id: string): Promise<any> {
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
    const lineItems = parseJson<{ id: string; variantId: string; quantity: number }[]>(order.lineItems as string, [])
    const fulfillments = parseJson<{ id: string; createdAt: string; lineItemIds: string[]; trackingNumber?: string; carrier?: string; locationId: string; status: string }[]>(order.fulfillments as string, [])

    for (const li of lineItems) {
      if (!input.lineItemIds.includes(li.id)) continue
      const level = await this.prisma.inventoryLevel.findUnique({
        where: { variantId_locationId: { variantId: li.variantId, locationId: input.locationId } },
      })
      if (level) {
        await this.prisma.inventoryLevel.update({
          where: { variantId_locationId: { variantId: level.variantId, locationId: level.locationId } },
          data: { committed: Math.max(0, level.committed - li.quantity) },
        })
      } else {
        await this.prisma.inventoryLevel.create({
          data: { variantId: li.variantId, locationId: input.locationId, available: 0, committed: 0, unavailable: 0 },
        })
      }
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
    if (input.amount <= 0) throw new Error('Refund amount must be greater than 0')
    const refunds = parseJson<{ id: string; createdAt: string; amount: number; reason: string; lineItemIds: string[]; restock: boolean }[]>(order.refunds as string, [])
    const already = refunds.reduce((s, r) => s + r.amount, 0)
    if (already + input.amount > order.total + 0.01) throw new Error('Refund exceeds order total')

    refunds.push({
      id: uid('rf'),
      createdAt: new Date().toISOString(),
      amount: roundMoney(input.amount),
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
    const lineItems = parseJson<{ id: string; variantId: string; quantity: number }[]>(order.lineItems as string, [])
    if (input.restock) {
      for (const li of lineItems) {
        if (!input.lineItemIds.includes(li.id)) continue
        const level = await this.prisma.inventoryLevel.findFirst({ where: { variantId: li.variantId } })
        if (level) {
          await this.prisma.inventoryLevel.update({
            where: { variantId_locationId: { variantId: level.variantId, locationId: level.locationId } },
            data: { available: level.available + li.quantity },
          })
        }
      }
    }
    const data: Record<string, unknown> = { refunds: toJson(refunds), paymentStatus }
    if (paymentStatus === 'refunded' && order.fulfillmentStatus === 'unfulfilled') {
      data.fulfillmentStatus = 'returned'
      data.status = 'closed'
      data.closedAt = new Date()
    }
    await this.prisma.order.update({ where: { id: order.id }, data })
    await this.addTimeline(
      order.id,
      'refund',
      `Refund of $${input.amount.toFixed(2)} issued (${input.reason})${input.restock ? ' · items restocked' : ''}`,
    )
    await this.logActivity('Refunded order', 'order', order.id)
    return this.order(order.id)
  }

  async orderEdit(id: string, added: any, removed: any): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new Error('Order not found')
    if (order.status !== 'open' || order.fulfillmentStatus !== 'unfulfilled') throw new Error('Only unfulfilled orders can be edited')

    let lineItems = parseJson<Record<string, any>[]>(order.lineItems as string, [])
    for (const rem of removed) {
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
          price: variant.price,
          totalDiscount: 0,
          requiresShipping: true,
          imageSrc: parseJson<{ src?: string }[]>(variantProduct.media as string, [])[0]?.src,
        })
      }
    }
    if (lineItems.length === 0) throw new Error('An order needs at least one item')

    const subtotal = roundMoney(lineItems.reduce((s, li) => s + li.price * li.quantity - (li.totalDiscount ?? 0), 0))
    const discountAmount = parseJson<{ amount: number } | null>(order.discountCode as string, null)?.amount ?? 0
    const taxTotal = roundMoney((subtotal - discountAmount) * TAX_RATE)
    const total = roundMoney(subtotal - discountAmount + order.shippingPrice + taxTotal)
    const delta = roundMoney(total - order.total)

    await this.prisma.order.update({ where: { id }, data: { lineItems: toJson(lineItems), subtotal, taxTotal, total } })
    await this.prisma.orderEdit.create({
      data: {
        id: uid('oe'),
        orderId: id,
        at: new Date(),
        author: author(),
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
    const record = await this.prisma.returnRecord.create({
      data: {
        id: uid('ret'),
        orderId: input.orderId,
        status: 'open',
        lines: toJson(input.lines),
        reason: input.reason,
        restock: input.restock ?? true,
        refundAmount: roundMoney(input.refundAmount ?? 0),
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

    if (ret.restock) {
      for (const line of lines) {
        const li = parseJson<{ id: string; variantId: string; quantity: number }[]>(order.lineItems as string, []).find((x) => x.id === line.lineItemId)
        if (!li) continue
        const level = await this.prisma.inventoryLevel.findFirst({ where: { variantId: li.variantId } })
        if (level) {
          await this.prisma.inventoryLevel.update({
            where: { variantId_locationId: { variantId: level.variantId, locationId: level.locationId } },
            data: { available: level.available + line.quantity },
          })
        }
      }
    }

    const refundAmount = ret.refundAmount
    if (markRefunded && refundAmount > 0) {
      const refunds = parseJson<{ id: string; createdAt: string; amount: number; reason: string; lineItemIds: string[]; restock: boolean }[]>(order.refunds as string, [])
      refunds.push({ id: uid('rf'), createdAt: new Date().toISOString(), amount: refundAmount, reason: ret.reason, lineItemIds: lines.map((l) => l.lineItemId), restock: false })
      const lineItems = parseJson<{ id: string; quantity: number }[]>(order.lineItems as string, [])
      const refundedAll = lineItems.every((li) => lines.some((l) => l.lineItemId === li.id && l.quantity >= li.quantity))
      const data: Record<string, unknown> = {
        refunds: toJson(refunds),
        paymentStatus: this.recomputePaymentStatus({ status: order.status, paymentStatus: order.paymentStatus, total: order.total, refunds: refunds as never }),
      }
      if (refundedAll) data.fulfillmentStatus = 'returned'
      await this.prisma.order.update({ where: { id: order.id }, data })
    }

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
    const items = parseJson<{ variantId: string; quantity: number }[]>(co.lineItems as string, [])
    const draft = await this.createDraft({ customerId: co.customerId, items, note: undefined, tags: [] })
    await this.prisma.abandonedCheckout.update({ where: { id }, data: { recoveryStatus: 'recovered' } })
    return this.convertDraft(draft.id as string)
  }

  // drafts
  async createDraft(input: any): Promise<any> {
    const shippingPrice = input.shippingPrice ?? 6.99
    const discountAmount = input.discountAmount ?? 0
    const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId } })
    if (!customer) throw new Error('Select a customer')
    const lineItems: Record<string, unknown>[] = []
    for (const li of input.items) {
      const product = await this.prisma.product.findFirst({ where: { variants: { array_contains: [{ id: li.variantId }] } } })
      if (!product) throw new Error('Invalid variant in draft')
      const variant = parseJson<Record<string, any>[]>(product.variants as string, []).find((v) => v.id === li.variantId)
      if (!variant) throw new Error('Invalid variant')
      lineItems.push({
        id: uid('li'),
        productId: product.id,
        variantId: variant.id,
        title: product.title,
        variantTitle: variant.title === 'Default Title' ? '' : variant.title,
        sku: variant.sku,
        quantity: li.quantity,
        price: variant.price,
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
    const shipping = shippingPrice
    const tax = roundMoney((subtotal - discountAmount) * TAX_RATE)
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
        shippingTitle: 'Standard shipping',
        shippingPrice: shipping,
        subtotal,
        taxTotal: tax,
        total: roundMoney(subtotal - discountAmount + shipping + tax),
    discountCode: discountAmount > 0 ? toJson({ code: 'CUSTOM', amount: discountAmount }) : null,
        currency: 'USD',
        tags: toJson(input.tags ?? []),
        note: input.note ?? null,
        timeline: toJson([{ id: uid('ev'), createdAt: now.toISOString(), type: 'created', message: 'Draft order created', author: author() }]),
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
    const rebuilt: any = await this.createDraft(input)
    await this.prisma.order.delete({ where: { id: rebuilt.id } })
    await this.prisma.order.update({
      where: { id },
      data: {
        lineItems: toJson(rebuilt.lineItems),
        subtotal: rebuilt.subtotal,
        taxTotal: rebuilt.taxTotal,
        total: rebuilt.total,
        customerId: rebuilt.customerId,
        email: rebuilt.email,
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
    const numbers = (await this.prisma.order.findMany({ where: { isDraft: false } })).map((o) => Number(o.name.replace('#', '')))
    const next = Math.max(1000, ...numbers) + 1
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

