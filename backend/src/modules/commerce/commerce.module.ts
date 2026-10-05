import { Injectable, Module } from '@nestjs/common'
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql'
import { PrismaService } from '../../prisma/prisma.service'
import { PrismaModule } from '../../prisma/prisma.module'
import { toConnection, filterByQuery, toJson, parseJson } from '../../common/helpers'
import { mapDiscount, mapGiftCard } from '../../common/mappers'
import { uid, roundMoney } from '../../common/ids'

@Injectable()
export class CommerceService {
  constructor(private prisma: PrismaService) {}

  // discounts
  async discount(id: string) {
    const row = await this.prisma.discount.findUnique({ where: { id } })
    return row ? mapDiscount(row as unknown as Record<string, unknown>) : null
  }

  async discounts(args: any) {
    let rows = (await this.prisma.discount.findMany({ orderBy: { startsAt: 'desc' } })) as unknown as Record<string, unknown>[]
    rows = filterByQuery(rows, args.query, (r) => [r.code as string, r.title as string])
    const mapped = rows.map(mapDiscount)
    return toConnection(mapped, args.first, args.after, args.last, args.before)
  }

  async createDiscount(input: Record<string, any>) {
    const code = (input.code ?? '').trim().toUpperCase()
    if (!code) throw new Error('Give the discount a code or name')
    if (await this.prisma.discount.findUnique({ where: { code } })) throw new Error('A discount with this code already exists')
    if (input.type === 'percentage' && (input.value ?? 0) > 100) throw new Error('Percentage cannot exceed 100')
    const row = await this.prisma.discount.create({
      data: {
        id: uid('disc'),
        code,
        title: input.title ?? code,
        type: input.type ?? 'percentage',
        method: input.method ?? 'code',
        value: input.value ?? null,
        bxgy: input.bxgy ? toJson(input.bxgy) : null,
        minPurchase: input.minPurchase ?? null,
        customerEligibility: input.customerEligibility ?? 'all',
        productEligibility: input.productEligibility ?? 'all',
        productIds: toJson(input.productIds ?? []),
        usageLimit: input.usageLimit ?? null,
        usedCount: 0,
        startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        status: input.status ?? 'active',
        combinations: toJson(input.combinations ?? { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }),
      },
    })
    return mapDiscount(row as unknown as Record<string, unknown>)
  }

  async updateDiscount(id: string, input: Record<string, any>) {
    const existing = await this.prisma.discount.findUnique({ where: { id } })
    if (!existing) throw new Error('Discount not found')
    const data: Record<string, unknown> = {}
    const direct: Record<string, (v: unknown) => unknown> = {
      code: (v) => String(v).trim().toUpperCase(),
      title: (v) => v,
      type: (v) => v,
      method: (v) => v,
      value: (v) => v,
      minPurchase: (v) => v,
      customerEligibility: (v) => v,
      productEligibility: (v) => v,
      usageLimit: (v) => v,
      status: (v) => v,
    }
    for (const [key, fn] of Object.entries(direct)) {
      if (input[key] !== undefined) data[key] = fn(input[key])
    }
    if (input.code !== undefined) {
      const code = String(input.code).trim().toUpperCase()
      const dup = await this.prisma.discount.findUnique({ where: { code } })
      if (dup && dup.id !== id) throw new Error('A discount with this code already exists')
      data.code = code
    }
    if (input.bxgy !== undefined) data.bxgy = toJson(input.bxgy)
    if (input.productIds !== undefined) data.productIds = toJson(input.productIds)
    if (input.combinations !== undefined) data.combinations = toJson(input.combinations)
    if (input.startsAt !== undefined) data.startsAt = new Date(input.startsAt)
    if (input.endsAt !== undefined) data.endsAt = input.endsAt ? new Date(input.endsAt) : null
    const nextType = (data.type as string | undefined) ?? existing.type
    const nextValue = data.value !== undefined ? data.value : existing.value
    if (nextType === 'percentage' && nextValue != null && Number(nextValue) > 100) {
      throw new Error('Percentage cannot exceed 100')
    }
    await this.prisma.discount.update({ where: { id }, data })
    return this.discount(id)
  }

  async deleteDiscounts(ids: string[]): Promise<string[]> {
    await this.prisma.discount.deleteMany({ where: { id: { in: ids } } })
    return ids
  }

  async setDiscountStatus(ids: string[], status: string): Promise<string[]> {
    await this.prisma.discount.updateMany({ where: { id: { in: ids } }, data: { status } })
    return ids
  }

  // campaigns
  async campaigns() {
    return this.prisma.campaign.findMany({ orderBy: { sentAt: 'desc', }, })
  }

  async createCampaign(input: any) {
    const row = await this.prisma.campaign.create({
      data: {
        id: uid('camp'),
        name: input.name,
        channel: input.channel,
        status: 'draft',
        audience: input.audience ?? 0,
        cost: input.cost ?? 0,
      },
    })
    return row
  }

  async launchCampaign(id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } })
    if (!c) throw new Error('Campaign not found')
    const reached = Math.round(c.audience * (0.55 + Math.random() * 0.35))
    const sessions = Math.round(reached * (0.06 + Math.random() * 0.2))
    const orders = Math.round(sessions * (0.01 + Math.random() * 0.07))
    await this.prisma.campaign.update({
      where: { id },
      data: {
        status: 'active',
        sentAt: new Date(),
        reached,
        sessions,
        orders,
        revenue: roundMoney(orders * (45 + Math.random() * 70)),
      },
    })
    return this.prisma.campaign.findUnique({ where: { id } })
  }

  async completeCampaign(id: string) {
    await this.prisma.campaign.update({ where: { id }, data: { status: 'completed' } })
    return this.prisma.campaign.findUnique({ where: { id } })
  }

  async deleteCampaign(id: string): Promise<string[]> {
    await this.prisma.campaign.delete({ where: { id } })
    return [id]
  }

  // gift cards
  async giftCard(id: string) {
    const row = await this.prisma.giftCard.findUnique({ where: { id } })
    return row ? mapGiftCard(row as unknown as Record<string, unknown>) : null
  }

  async giftCards(args: any) {
    let rows = (await this.prisma.giftCard.findMany({ orderBy: { createdAt: 'desc' } })) as unknown as Record<string, unknown>[]
    rows = filterByQuery(rows, args.query, (r) => [r.code as string, r.note as string])
    const mapped = rows.map(mapGiftCard)
    return toConnection(mapped, args.first, args.after, args.last, args.before)
  }

  async createGiftCard(input: any) {
    if (input.initialBalance <= 0) throw new Error('Initial balance must be greater than 0')
    const gen = () => String(Math.floor(Math.random() * 9000 + 1000))
    const issuedAt = new Date()
    const row = await this.prisma.giftCard.create({
      data: {
        id: uid('gc'),
        code: `NORTH-${gen()}-${gen()}-${gen()}`,
        customerId: input.customerId ?? null,
        initialBalance: roundMoney(input.initialBalance),
        balance: roundMoney(input.initialBalance),
        status: 'enabled',
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        note: input.note ?? null,
        createdAt: issuedAt,
        history: toJson([{ id: uid('gch'), at: issuedAt.toISOString(), type: 'issued', amount: roundMoney(input.initialBalance), note: input.customerId ? 'Issued to customer' : 'Issued manually' }]),
      },
    })
    return mapGiftCard(row as unknown as Record<string, unknown>)
  }

  async setGiftCardStatus(id: string, status: 'enabled' | 'disabled') {
    const card = await this.prisma.giftCard.findUnique({ where: { id } })
    if (!card) throw new Error('Gift card not found')
    if (card.status === 'expired') throw new Error('Expired cards cannot be re-enabled')
    const history = parseJson<unknown[]>(card.history as string, [])
    history.push({ id: uid('gch'), at: new Date().toISOString(), type: status, amount: 0, note: status === 'disabled' ? 'Disabled by staff' : 'Enabled by staff' })
    await this.prisma.giftCard.update({ where: { id }, data: { status, history: toJson(history) } })
    return this.giftCard(id)
  }

  async adjustGiftCard(id: string, newBalance: number, note?: string) {
    if (newBalance < 0) throw new Error('Balance cannot be negative')
    const card = await this.prisma.giftCard.findUnique({ where: { id } })
    if (!card) throw new Error('Gift card not found')
    const history = parseJson<unknown[]>(card.history as string, [])
    const change = roundMoney(newBalance - card.balance)
    history.push({ id: uid('gch'), at: new Date().toISOString(), type: 'adjusted', amount: change, note: note ?? 'Adjusted by staff' })
    await this.prisma.giftCard.update({ where: { id }, data: { balance: roundMoney(newBalance), history: toJson(history) } })
    return this.giftCard(id)
  }

  async updateGiftCard(id: string, note?: string, expiresOn?: string) {
    const card = await this.prisma.giftCard.findUnique({ where: { id } })
    if (!card) throw new Error('Gift card not found')
    const data: Record<string, unknown> = {}
    if (note !== undefined) data.note = note
    if (expiresOn !== undefined) data.expiresAt = expiresOn ? new Date(expiresOn) : null
    const history = parseJson<unknown[]>(card.history as string, [])
    history.push({ id: uid('gch'), at: new Date().toISOString(), type: 'updated', amount: 0, note: note ?? 'Gift card updated' })
    data.history = toJson(history)
    await this.prisma.giftCard.update({ where: { id }, data })
    return this.giftCard(id)
  }

  async discountsCount(query?: string) {
    const rows = (await this.prisma.discount.findMany()) as unknown as Record<string, unknown>[]
    return filterByQuery(rows, query, (r) => [r.code as string, r.title as string]).length
  }

  async giftCardsCount(query?: string) {
    const rows = (await this.prisma.giftCard.findMany()) as unknown as Record<string, unknown>[]
    return filterByQuery(rows, query, (r) => [r.code as string, r.note as string]).length
  }

  async sendNotification(id: string) {
    const card = await this.prisma.giftCard.findUnique({ where: { id } })
    if (!card) throw new Error('Gift card not found')
    if (card.status === 'disabled') {
      throw new Error('Cannot send notification for a disabled gift card')
    }
    if (card.expiresAt && new Date() > card.expiresAt) {
      throw new Error('Cannot send notification for an expired gift card')
    }
    const history = parseJson<unknown[]>(card.history as string, [])
    history.push({
      id: uid('gch'),
      at: new Date().toISOString(),
      type: 'notification_sent',
      amount: 0,
      note: 'Gift card notification sent to customer',
    })
    const updated = await this.prisma.giftCard.update({
      where: { id },
      data: { history: toJson(history) },
    })
    await this.prisma.notification.create({
      data: {
        id: uid('notif'),
        kind: 'gift_card',
        title: 'Gift Card Sent',
        body: `Gift card ${card.code} was sent to customer`,
        link: `/gift-cards/${card.id}`,
      },
    })
    return updated
  }
}

@Resolver('Discount')
export class CommerceResolver {
  constructor(private readonly service: CommerceService) {}

  @Query()
  discount(@Args('id') id: string) {
    return this.service.discount(id)
  }
  @Query()
  discountsCount(@Args('query', { nullable: true }) query?: string) {
    return this.service.discountsCount(query)
  }
  @Query()
  giftCardsCount(@Args('query', { nullable: true }) query?: string) {
    return this.service.giftCardsCount(query)
  }

  @Query()
  discounts(@Args() args: Record<string, any>) {
    return this.service.discounts(args)
  }

  @Query()
  campaigns() {
    return this.service.campaigns()
  }

  @Query()
  giftCard(@Args('id') id: string) {
    return this.service.giftCard(id)
  }

  @Query()
  giftCards(@Args() args: Record<string, any>) {
    return this.service.giftCards(args)
  }

  @Mutation()
  async discountCreate(@Args('discount') discount: Record<string, any>) {
    try {
      return { discount: await this.service.createDiscount(discount), userErrors: [] }
    } catch (e) {
      return { discount: null, userErrors: [{ field: ['discount'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async discountUpdate(@Args('id') id: string, @Args('discount') discount: Record<string, any>) {
    try {
      return { discount: await this.service.updateDiscount(id, discount), userErrors: [] }
    } catch (e) {
      return { discount: null, userErrors: [{ field: ['discount'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  discountDelete(@Args('ids') ids: string[]) {
    return { deletedIds: this.service.deleteDiscounts(ids), userErrors: [] }
  }

  @Mutation()
  discountStatusSet(@Args('ids') ids: string[], @Args('status') status: string) {
    return { deletedIds: this.service.setDiscountStatus(ids, status), userErrors: [] }
  }

  @Mutation()
  async campaignCreate(@Args('campaign') campaign: Record<string, any>) {
    try {
      return { campaign: await this.service.createCampaign(campaign), userErrors: [] }
    } catch (e) {
      return { campaign: null, userErrors: [{ field: ['campaign'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async campaignLaunch(@Args('id') id: string) {
    try {
      return { campaign: await this.service.launchCampaign(id), userErrors: [] }
    } catch (e) {
      return { campaign: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async campaignComplete(@Args('id') id: string) {
    try {
      return { campaign: await this.service.completeCampaign(id), userErrors: [] }
    } catch (e) {
      return { campaign: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  campaignDelete(@Args('id') id: string) {
    return { deletedIds: this.service.deleteCampaign(id), userErrors: [] }
  }

  @Mutation()
  async giftCardCreate(@Args('input') input: Record<string, any>) {
    try {
      return { giftCard: await this.service.createGiftCard(input), userErrors: [] }
    } catch (e) {
      return { giftCard: null, userErrors: [{ field: ['input'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async giftCardDisable(@Args('id') id: string) {
    try {
      return { giftCard: await this.service.setGiftCardStatus(id, 'disabled'), userErrors: [] }
    } catch (e) {
      return { giftCard: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async giftCardEnable(@Args('id') id: string) {
    try {
      return { giftCard: await this.service.setGiftCardStatus(id, 'enabled'), userErrors: [] }
    } catch (e) {
      return { giftCard: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async giftCardBalanceAdjust(@Args('id') id: string, @Args('newBalance') newBalance: number, @Args('note', { nullable: true }) note?: string) {
    try {
      return { giftCard: await this.service.adjustGiftCard(id, newBalance, note), userErrors: [] }
    } catch (e) {
      return { giftCard: null, userErrors: [{ field: ['newBalance'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async giftCardSendNotification(@Args('id') id: string) {
    try {
      return { giftCard: await this.service.sendNotification(id), userErrors: [] }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      return { giftCard: null, userErrors: [{ field: ['id'], message }] }
    }
  }
  @Mutation()
  async giftCardUpdate(@Args('id') id: string, @Args('note', { nullable: true }) note?: string, @Args('expiresOn', { nullable: true }) expiresOn?: string) {
    try {
      return { giftCard: await this.service.updateGiftCard(id, note, expiresOn), userErrors: [] }
    } catch (e) {
      return { giftCard: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }
}

@Module({
  imports: [PrismaModule],
  providers: [CommerceResolver, CommerceService],
})
export class CommerceModule {}
