import { Injectable, Module } from '@nestjs/common'
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql'
import { PrismaService } from '../../prisma/prisma.service'
import { PrismaModule } from '../../prisma/prisma.module'
import { parseJson, toJson, toConnection, filterByQuery } from '../../common/helpers'
import { mapCustomer, mapCompany, mapSegment } from '../../common/mappers'
import { uid, roundMoney } from '../../common/ids'

const CONSENT_STATES: Record<string, true> = { subscribed: true, unsubscribed: true, pending: true }

// B2B pricing for a customer's company: location-scoped price list entry wins,
// then company-wide entry, else null (caller falls back to discount percent).
export async function b2bPricing(
  prisma: PrismaService,
  customerId: string,
  variantId: string,
): Promise<{ fixedPrice: number | null; discountPercent: number }> {
  const company = await prisma.company.findFirst({ where: { customerId } })
  if (!company) return { fixedPrice: null, discountPercent: 0 }
  const lists = await prisma.priceList.findMany({ where: { companyId: company.id }, include: { entries: true } })
  const candidates = lists.filter((l) => l.entries.some((e) => e.variantId === variantId))
  const entry =
    (candidates.find((l) => l.locationId != null) ?? candidates.find((l) => l.locationId == null))
      ?.entries.find((e) => e.variantId === variantId) ?? null
  return { fixedPrice: entry ? entry.price : null, discountPercent: company.priceListDiscountPercent }
}

interface PriceListEntryRow {
  id: string
  variantId: string
  price: number
}

interface PriceListRow {
  id: string
  name: string
  currency: string
  companyId: string | null
  locationId: string | null
  createdAt: Date
  updatedAt: Date
  entries: PriceListEntryRow[]
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async statsFor(customerId: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerId, status: { notIn: ['draft', 'cancelled'] } },
      select: { total: true, refunds: true, createdAt: true },
    })
    const totalSpent = roundMoney(
      orders.reduce((s, o) => {
        const refunds = parseJson<{ amount: number }[]>(o.refunds as string, [])
        const refunded = refunds.reduce((rSum, r) => rSum + r.amount, 0)
        return s + Math.max(0, o.total - refunded)
      }, 0),
    )
    const last = orders.sort((a, b) => b.createdAt.toISOString().localeCompare(a.createdAt.toISOString()))[0]
    return { ordersCount: orders.length, totalSpent, lastOrderAt: last?.createdAt ?? null }
  }

  private decorate(rows: Record<string, unknown>[], statsMap?: Map<string, Awaited<ReturnType<CustomersService['statsFor']>>>) {
    return rows.map((r) => {
      const stats = statsMap?.get(r.id as string)
      return mapCustomer(r, stats ? { ...stats, lastOrderAt: stats.lastOrderAt ? new Date(stats.lastOrderAt) : null } : undefined)
    })
  }

  async customer(id: string) {
    const row = await this.prisma.customer.findUnique({ where: { id } })
    if (!row) return null
    return this.decorate([row as unknown as Record<string, unknown>], new Map([[id, await this.statsFor(id)]]))[0]
  }

  async customers(args: any) {
    let rows = (await this.prisma.customer.findMany({ orderBy: { createdAt: 'desc' } })) as unknown as Record<string, unknown>[]
    rows = filterByQuery(rows, args.query, (r) => [
      `${r.firstName} ${r.lastName}`, r.email as string, (r.phone as string) ?? '',
      parseJson<{ city?: string }[]>(r.addresses as string, []).map((a) => a.city ?? '').join(' '),
    ])
    const statsMap = new Map<string, Awaited<ReturnType<CustomersService['statsFor']>>>()
    for (const r of rows) statsMap.set(r.id as string, await this.statsFor(r.id as string))
    const decorated = this.decorate(rows, statsMap)
    return toConnection(decorated, args.first, args.after, args.last, args.before)
  }

  async customersCount(query?: string) {
    if (!query) return this.prisma.customer.count()
    let rows = (await this.prisma.customer.findMany({ orderBy: { createdAt: 'desc' } })) as unknown as Record<string, unknown>[]
    rows = filterByQuery(rows, query, (r) => [
      `${r.firstName} ${r.lastName}`, r.email as string, (r.phone as string) ?? '',
      parseJson<{ city?: string }[]>(r.addresses as string, []).map((a) => a.city ?? '').join(' '),
    ])
    return rows.length
  }

  async create(input: Record<string, any>) {
    if (await this.prisma.customer.findUnique({ where: { email: input.email } })) {
      throw new Error('A customer with this email already exists')
    }
    const address = input.defaultAddress?.address1
      ? { firstName: input.firstName, lastName: input.lastName, ...input.defaultAddress }
      : null
    const row = await this.prisma.customer.create({
      data: {
        id: uid('c'),
        firstName: input.firstName,
        lastName: input.lastName ?? '',
        email: input.email,
        phone: input.phone ?? null,
        note: input.note ?? null,
        tags: toJson(input.tags ?? []),
        emailMarketingConsent: input.emailMarketingConsent ?? (input.acceptsMarketing ? 'subscribed' : 'not_subscribed'),
        taxExempt: input.taxExempt ?? false,
        defaultAddress: toJson(address),
        addresses: toJson(address ? [address] : []),
      },
    })
    return this.decorate([row as unknown as Record<string, unknown>])[0]
  }

  async update(id: string, input: Record<string, any>) {
    const existing = await this.prisma.customer.findUnique({ where: { id } })
    if (!existing) throw new Error('Customer not found')
    const data: Record<string, unknown> = {}
    for (const key of ['firstName', 'lastName', 'email', 'phone', 'note', 'emailMarketingConsent', 'taxExempt']) {
      if (input[key] !== undefined) data[key] = input[key]
    }
    if (input.tags !== undefined) data.tags = toJson(input.tags)
    if (input.defaultAddress !== undefined) {
      const current = parseJson<Record<string, unknown>[]>(existing.addresses as string, [])
      const address = { firstName: input.firstName ?? existing.firstName, lastName: input.lastName ?? existing.lastName, ...(input.defaultAddress as object) }
      const addresses = current.length === 0 ? [address] : current.map((a, i) => (i === 0 ? { ...a, ...address } : a))
      data.addresses = toJson(addresses)
      data.defaultAddress = toJson({ ...(parseJson<Record<string, unknown>>(existing.defaultAddress as string, {}) || {}), ...address })
    }
    await this.prisma.customer.update({ where: { id }, data })
    return this.customer(id)
  }

  async delete(ids: string[]): Promise<string[]> {
    await this.prisma.customer.deleteMany({ where: { id: { in: ids } } })
    return ids
  }

  async modifyTags(ids: string[], tags: string[], mode: 'add' | 'remove'): Promise<string[]> {
    for (const id of ids) {
      const c = await this.prisma.customer.findUnique({ where: { id } })
      if (!c) continue
      const current = parseJson<string[]>(c.tags as string, [])
      const next = mode === 'add' ? [...new Set([...current, ...tags])] : current.filter((t) => !tags.includes(t))
      await this.prisma.customer.update({ where: { id }, data: { tags: toJson(next) } })
    }
    return ids
  }

  async addAddress(id: string, address: Record<string, any>) {
    const c = await this.prisma.customer.findUnique({ where: { id } })
    if (!c) throw new Error('Customer not found')
    const full = { firstName: c.firstName, lastName: c.lastName, ...address }
    const addresses = parseJson<Record<string, unknown>[]>(c.addresses as string, [])
    addresses.push(full)
    await this.prisma.customer.update({
      where: { id },
      data: { addresses: toJson(addresses), defaultAddress: c.defaultAddress ? toJson(parseJson(c.defaultAddress as string, {})) : toJson(full) },
    })
    return this.customer(id)
  }

  async setDefaultAddress(id: string, index: number) {
    const c = await this.prisma.customer.findUnique({ where: { id } })
    if (!c) throw new Error('Customer not found')
    const addresses = parseJson<Record<string, unknown>[]>(c.addresses as string, [])
    if (!addresses[index]) throw new Error('Address not found')
    await this.prisma.customer.update({ where: { id }, data: { defaultAddress: toJson(addresses[index]) } })
    return this.customer(id)
  }

  // companies + price lists
  private mapPriceList(l: PriceListRow) {
    return {
      id: l.id,
      name: l.name,
      currency: l.currency,
      companyId: l.companyId,
      locationId: l.locationId,
      parentCompanyId: l.companyId,
      entries: l.entries.map((e) => ({ id: e.id, variantId: e.variantId, price: e.price })),
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }
  }

  private async priceListsFor(companyIds: string[]): Promise<PriceListRow[]> {
    if (companyIds.length === 0) return []
    return this.prisma.priceList.findMany({
      where: { companyId: { in: companyIds } },
      include: { entries: true },
      orderBy: { createdAt: 'asc' },
    })
  }

  private async decorateCompany(c: Record<string, unknown>, preloadedLists?: PriceListRow[]) {
    const stats = await this.statsFor(c.customerId as string)
    const lists = preloadedLists ?? (await this.priceListsFor([c.id as string]))
    return { ...mapCompany(c, stats.totalSpent), priceLists: lists.map((l) => this.mapPriceList(l)) }
  }

  async company(id: string) {
    const row = await this.prisma.company.findUnique({ where: { id } })
    return row ? this.decorateCompany(row as unknown as Record<string, unknown>) : null
  }

  async companies(args: Record<string, unknown>) {
    let rows = (await this.prisma.company.findMany({ orderBy: { name: 'asc' } })) as unknown as Record<string, unknown>[]
    rows = filterByQuery(rows, args.query as string | undefined, (r) => [r.name as string, (r.externalId as string) ?? ''])
    const allLists = await this.priceListsFor(rows.map((r) => r.id as string))
    const listsByCompany = new Map<string, PriceListRow[]>()
    for (const l of allLists) {
      const bucket = listsByCompany.get(l.companyId ?? '') ?? []
      bucket.push(l)
      listsByCompany.set(l.companyId ?? '', bucket)
    }
    const decorated = await Promise.all(rows.map((r) => this.decorateCompany(r, listsByCompany.get(r.id as string) ?? [])))
    return toConnection(decorated, args.first as number | undefined, args.after as string | undefined, args.last as number | undefined, args.before as string | undefined)
  }

  async createCompany(input: Record<string, any>) {
    if (await this.prisma.company.findUnique({ where: { name: input.name } })) {
      throw new Error('A company with this name already exists')
    }
    const locationId = uid('cl')
    const row = await this.prisma.company.create({
      data: {
        id: uid('company'),
        name: input.name,
        externalId: input.externalId ?? null,
        status: 'active',
        customerId: input.customerId,
        priceListDiscountPercent: input.priceListDiscountPercent ?? 0,
        locations: toJson(
          input.locationName
            ? [{ id: locationId, name: input.locationName, phone: null, address: input.address ?? {}, taxExempt: false }]
            : [],
        ),
        contacts: toJson([]),
        createdAt: new Date(),
      },
    })
    return this.decorateCompany(row as unknown as Record<string, unknown>)
  }

  async updateCompany(id: string, input: Record<string, any>) {
    const existing = await this.prisma.company.findUnique({ where: { id } })
    if (!existing) throw new Error('Company not found')
    const data: Record<string, unknown> = {}
    for (const key of ['name', 'externalId', 'status', 'customerId', 'note', 'priceListDiscountPercent']) {
      if (input[key] !== undefined) data[key] = input[key]
    }
    await this.prisma.company.update({ where: { id }, data })
    return this.decorateCompany({ ...existing, ...data } as unknown as Record<string, unknown>)
  }

  async deleteCompany(id: string): Promise<string[]> {
    await this.prisma.company.delete({ where: { id } })
    return [id]
  }

  async addCompanyLocation(id: string, location: Record<string, any>) {
    const c = await this.prisma.company.findUnique({ where: { id } })
    if (!c) throw new Error('Company not found')
    const locations = parseJson<Record<string, unknown>[]>(c.locations as string, [])
    locations.push({ id: uid('cl'), name: location.name, phone: location.phone ?? null, address: location.address, taxExempt: location.taxExempt ?? false })
    await this.prisma.company.update({ where: { id }, data: { locations: toJson(locations) } })
    return this.decorateCompany({ ...c, locations: toJson(locations) } as unknown as Record<string, unknown>)
  }

  async addCompanyContact(id: string, contact: Record<string, any>) {
    const c = await this.prisma.company.findUnique({ where: { id } })
    if (!c) throw new Error('Company not found')
    const contacts = parseJson<Record<string, unknown>[]>(c.contacts as string, [])
    if (contacts.some((x) => x.email === contact.email)) throw new Error('This contact already exists')
    const locations = parseJson<{ id: string }[]>(c.locations as string, [])
    contacts.push({ id: uid('cc'), name: contact.name, email: contact.email, phone: contact.phone ?? null, locationIds: locations.map((l) => l.id), isPrimary: contacts.length === 0 })
    await this.prisma.company.update({ where: { id }, data: { contacts: toJson(contacts) } })
    return this.decorateCompany({ ...c, contacts: toJson(contacts) } as unknown as Record<string, unknown>)
  }

  // price lists
  async priceLists(companyId?: string): Promise<unknown[]> {
    const rows = await this.prisma.priceList.findMany({
      where: companyId ? { companyId } : undefined,
      include: { entries: true },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((r) => this.mapPriceList(r))
  }

  async priceList(id: string) {
    const row = await this.prisma.priceList.findUnique({ where: { id }, include: { entries: true } })
    return row ? this.mapPriceList(row) : null
  }

  private dedupeEntries(entries: { variantId: string; price: number }[] | undefined) {
    const byVariant = new Map<string, { variantId: string; price: number }>()
    for (const e of entries ?? []) {
      if (typeof e.price !== 'number' || e.price < 0) throw new Error(`Invalid price for variant ${e.variantId}: must be a number >= 0`)
      byVariant.set(e.variantId, { variantId: e.variantId, price: e.price }) // last entry per variant wins
    }
    return [...byVariant.values()]
  }

  async createPriceList(input: Record<string, any>) {
    if (input.companyId && !(await this.prisma.company.findUnique({ where: { id: input.companyId } }))) {
      throw new Error('Company not found')
    }
    const row = await this.prisma.priceList.create({
      data: {
        name: input.name,
        currency: input.currency ?? 'USD',
        companyId: input.companyId ?? null,
        locationId: input.locationId ?? null,
        entries: { create: this.dedupeEntries(input.entries) },
      },
      include: { entries: true },
    })
    return this.mapPriceList(row)
  }

  async updatePriceList(id: string, input: Record<string, any>) {
    const existing = await this.prisma.priceList.findUnique({ where: { id } })
    if (!existing) throw new Error('Price list not found')
    if (input.companyId && !(await this.prisma.company.findUnique({ where: { id: input.companyId } }))) {
      throw new Error('Company not found')
    }
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.priceListEntry.deleteMany({ where: { priceListId: id } })
      return tx.priceList.update({
        where: { id },
        data: {
          name: input.name,
          currency: input.currency ?? existing.currency,
          companyId: input.companyId ?? null,
          locationId: input.locationId ?? null,
          entries: { create: this.dedupeEntries(input.entries) },
        },
        include: { entries: true },
      })
    })
    return this.mapPriceList(row)
  }

  async deletePriceList(id: string) {
    const existing = await this.prisma.priceList.findUnique({ where: { id } })
    if (!existing) throw new Error('Price list not found')
    await this.prisma.priceList.delete({ where: { id } })
    return id
  }

  async sendAccountInviteEmail(id: string) {
    const c = await this.prisma.customer.findUnique({ where: { id } })
    if (!c) throw new Error('Customer not found')
    if (!c.email) throw new Error('Customer has no email address')
    await this.prisma.notification.create({
      data: {
        id: uid('notif'),
        kind: 'customer',
        title: 'Account Invitation',
        body: `Account invitation sent to ${c.email}`,
        link: `/customers/${c.id}`,
      },
    })
    return this.customer(id)
  }

  async updateEmailConsent(ids: string[], consentState: string) {
    if (!CONSENT_STATES[consentState]) throw new Error(`Invalid consent state: ${consentState}`)
    const rows = await this.prisma.customer.findMany({ where: { id: { in: ids } } })
    await this.prisma.customer.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { emailMarketingConsent: consentState },
    })
    return this.decorateCustomers(rows as unknown as Record<string, unknown>[])
  }

  async updateSmsConsent(ids: string[], consentState: string) {
    if (!CONSENT_STATES[consentState]) throw new Error(`Invalid consent state: ${consentState}`)
    const rows = await this.prisma.customer.findMany({ where: { id: { in: ids } } })
    await this.prisma.customer.updateMany({
      where: { id: { in: ids } },
      data: { smsMarketingConsent: consentState },
    })
    const updated = rows.map((r) => ({ ...r, smsMarketingConsent: consentState }))
    return this.decorateCustomers(updated as unknown as Record<string, unknown>[])
  }

  private async decorateCustomers(rows: Record<string, unknown>[]) {
    const statsMap = new Map<string, Awaited<ReturnType<CustomersService['statsFor']>>>()
    for (const r of rows) statsMap.set(r.id as string, await this.statsFor(r.id as string))
    return this.decorate(rows, statsMap)
  }

  async mergeCustomers(primaryId: string, secondaryId: string) {
    if (primaryId === secondaryId) throw new Error('Cannot merge a customer with itself')
    const primary = await this.prisma.customer.findUnique({ where: { id: primaryId } })
    const secondary = await this.prisma.customer.findUnique({ where: { id: secondaryId } })
    if (!primary) throw new Error('Primary customer not found')
    if (!secondary) throw new Error('Secondary customer not found')
    await this.prisma.order.updateMany({ where: { customerId: secondaryId }, data: { customerId: primaryId } })
    await this.prisma.giftCard.updateMany({ where: { customerId: secondaryId }, data: { customerId: primaryId } })
    const tags = [
      ...new Set([
        ...parseJson<string[]>(primary.tags as string, []),
        ...parseJson<string[]>(secondary.tags as string, []),
      ]),
    ]
    const primaryAddresses = parseJson<Record<string, unknown>[]>(primary.addresses as string, [])
    const secondaryAddresses = parseJson<Record<string, unknown>[]>(secondary.addresses as string, [])
    const addressKey = (a: Record<string, unknown>) => `${a.address1 ?? ''}|${a.zip ?? ''}`
    const primaryKeys = new Set(primaryAddresses.map(addressKey))
    const addresses = [...primaryAddresses, ...secondaryAddresses.filter((a) => !primaryKeys.has(addressKey(a)))]
    await this.prisma.customer.update({ where: { id: primaryId }, data: { tags: toJson(tags), addresses: toJson(addresses) } })
    await this.prisma.customer.delete({ where: { id: secondaryId } })
    return this.customer(primaryId)
  }

  async segmentsCount() {
    return this.prisma.segment.count()
  }

  // segments
  async matchesSegment(customer: Record<string, unknown>, filters: { column: string; relation: string; value: string }[]): Promise<boolean> {
    const stats = await this.statsFor(customer.id as string)
    return filters.every((f) => {
      const value = f.value.trim().toLowerCase()
      if (f.column === 'tag') {
        const tags = parseJson<string[]>(customer.tags as string, []).map((t) => t.toLowerCase())
        if (f.relation === 'equals') return tags.includes(value)
        if (f.relation === 'contains') return tags.some((t) => t.includes(value))
        return false
      }
      const actual =
        f.column === 'orders_count' ? stats.ordersCount
        : f.column === 'total_spent' ? stats.totalSpent
        : f.column === 'email_state' ? customer.emailMarketingConsent
        : f.column === 'city' ? (parseJson<{ city?: string }>(customer.defaultAddress as string, {})?.city ?? '')
        : (parseJson<{ country?: string }>(customer.defaultAddress as string, {})?.country ?? '')
      const numeric = Number(value)
      switch (f.relation) {
        case 'gt': return !Number.isNaN(numeric) && Number(actual) > numeric
        case 'lt': return !Number.isNaN(numeric) && Number(actual) < numeric
        case 'equals': return String(actual).toLowerCase() === value
        case 'contains': return String(actual).toLowerCase().includes(value)
        default: return false
      }
    })
  }

  async segment(id: string) {
    const row = await this.prisma.segment.findUnique({ where: { id } })
    if (!row) return null
    const members = await this.segmentMemberRows(row)
    return mapSegment(row as unknown as Record<string, unknown>, members.length)
  }

  async segments() {
    const rows = await this.prisma.segment.findMany({ orderBy: { createdAt: 'desc' } })
    return Promise.all(rows.map(async (r) => {
      const members = await this.segmentMemberRows(r as unknown as Record<string, unknown>)
      return mapSegment(r as unknown as Record<string, unknown>, members.length)
    }))
  }

  private async segmentMemberRows(segment: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    const filters = parseJson<{ column: string; relation: string; value: string }[]>(segment.filters as string, [])
    const rows = (await this.prisma.customer.findMany()) as unknown as Record<string, unknown>[]
    const matched: Record<string, unknown>[] = []
    for (const row of rows) if (await this.matchesSegment(row, filters)) matched.push(row)
    return matched
  }

  async segmentMembers(id: string, first: number) {
    const row = await this.prisma.segment.findUnique({ where: { id } })
    if (!row) throw new Error('Segment not found')
    const members = await this.segmentMemberRows(row as unknown as Record<string, unknown>)
    const sliced = members.slice(0, first)
    const statsMap = new Map<string, Awaited<ReturnType<CustomersService['statsFor']>>>()
    for (const m of sliced) statsMap.set(m.id as string, await this.statsFor(m.id as string))
    return { customers: this.decorate(sliced, statsMap), totalCount: members.length }
  }

  async createSegment(input: Record<string, any>) {
    if (await this.prisma.segment.findFirst({ where: { name: input.name } })) {
      throw new Error('A segment with this name already exists')
    }
    if (!input.filters?.length) throw new Error('Add at least one filter')
    const row = await this.prisma.segment.create({
      data: { id: uid('seg'), name: input.name, description: input.description ?? null, filters: toJson(input.filters), createdAt: new Date() },
    })
    return this.segment(row.id)
  }

  async updateSegment(id: string, input: Record<string, any>) {
    const existing = await this.prisma.segment.findUnique({ where: { id } })
    if (!existing) throw new Error('Segment not found')
    await this.prisma.segment.update({
      where: { id },
      data: {
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
        filters: input.filters ? toJson(input.filters) : existing.filters,
      },
    })
    return this.segment(id)
  }

  async deleteSegment(id: string): Promise<string[]> {
    await this.prisma.segment.delete({ where: { id } })
    return [id]
  }
}

// ─── Resolver ───────────────────────────────────────────────────────────────

@Resolver('Customer')
export class CustomersResolver {
  constructor(private readonly service: CustomersService) {}

  @Query()
  customer(@Args('id') id: string) {
    return this.service.customer(id)
  }

  @Query()
  customers(@Args() args: Record<string, any>) {
    return this.service.customers(args)
  }

  @Query()
  companies(@Args() args: Record<string, any>) {
    return this.service.companies(args)
  }

  @Query()
  company(@Args('id') id: string) {
    return this.service.company(id)
  }

  @Query()
  priceLists(@Args('companyId', { nullable: true }) companyId: string) {
    return this.service.priceLists(companyId)
  }

  @Query()
  priceList(@Args('id') id: string) {
    return this.service.priceList(id)
  }

  @Query()
  segmentsCount() {
    return this.service.segmentsCount()
  }

  @Query()
  customersCount(@Args('query', { nullable: true }) query?: string) {
    return this.service.customersCount(query)
  }

  @Query()
  segments() {
    return this.service.segments()
  }

  @Query()
  segment(@Args('id') id: string) {
    return this.service.segment(id)
  }

  @Query()
  segmentMembers(@Args('id') id: string, @Args('first', { nullable: true }) first: number) {
    return this.service.segmentMembers(id, first ?? 50)
  }

  @Mutation()
  async customerCreate(@Args('customer') customer: Record<string, any>) {
    try {
      return { customer: await this.service.create(customer), userErrors: [] }
    } catch (e) {
      return { customer: null, userErrors: [{ field: ['customer'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async customerUpdate(@Args('id') id: string, @Args('customer') customer: Record<string, any>) {
    try {
      return { customer: await this.service.update(id, customer), userErrors: [] }
    } catch (e) {
      return { customer: null, userErrors: [{ field: ['customer'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  customerDelete(@Args('ids') ids: string[]) {
    return { deletedIds: this.service.delete(ids), userErrors: [] }
  }

  @Mutation()
  customerAddTags(@Args('ids') ids: string[], @Args('tags') tags: string[]) {
    return { updatedIds: this.service.modifyTags(ids, tags, 'add'), userErrors: [] }
  }

  @Mutation()
  customerRemoveTags(@Args('ids') ids: string[], @Args('tags') tags: string[]) {
    return { updatedIds: this.service.modifyTags(ids, tags, 'remove'), userErrors: [] }
  }

  @Mutation()
  async customerAddressAdd(@Args('id') id: string, @Args('address') address: Record<string, any>) {
    try {
      return { customer: await this.service.addAddress(id, address), userErrors: [] }
    } catch (e) {
      return { customer: null, userErrors: [{ field: ['address'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async customerAddressDefaultSet(@Args('id') id: string, @Args('index') index: number) {
    try {
      return { customer: await this.service.setDefaultAddress(id, index), userErrors: [] }
    } catch (e) {
      return { customer: null, userErrors: [{ field: ['index'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async customerSendAccountInviteEmail(@Args('id') id: string) {
    try {
      return { customer: await this.service.sendAccountInviteEmail(id), userErrors: [] }
    } catch (e) {
      return { customer: null, userErrors: [{ field: ['customer'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async customerEmailMarketingConsentUpdate(@Args('ids') ids: string[], @Args('consentState') consentState: string) {
    try {
      return { customers: await this.service.updateEmailConsent(ids, consentState), userErrors: [] }
    } catch (e) {
      return { customers: [], userErrors: [{ field: ['consentState'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async customerSmsMarketingConsentUpdate(@Args('ids') ids: string[], @Args('consentState') consentState: string) {
    try {
      return { customers: await this.service.updateSmsConsent(ids, consentState), userErrors: [] }
    } catch (e) {
      return { customers: [], userErrors: [{ field: ['consentState'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async customerMerge(@Args('primaryId') primaryId: string, @Args('secondaryId') secondaryId: string) {
    try {
      return { customer: await this.service.mergeCustomers(primaryId, secondaryId), userErrors: [] }
    } catch (e) {
      return { customer: null, userErrors: [{ field: ['customer'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async companyCreate(@Args('company') company: Record<string, any>) {
    try {
      return { company: await this.service.createCompany(company), userErrors: [] }
    } catch (e) {
      return { company: null, userErrors: [{ field: ['company'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async companyUpdate(@Args('id') id: string, @Args('company') company: Record<string, any>) {
    try {
      return { company: await this.service.updateCompany(id, company), userErrors: [] }
    } catch (e) {
      return { company: null, userErrors: [{ field: ['company'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  companyDelete(@Args('id') id: string) {
    return { deletedIds: this.service.deleteCompany(id), userErrors: [] }
  }

  @Mutation()
  async companyLocationAdd(@Args('id') id: string, @Args('location') location: Record<string, any>) {
    try {
      return { company: await this.service.addCompanyLocation(id, location), userErrors: [] }
    } catch (e) {
      return { company: null, userErrors: [{ field: ['location'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async companyContactAdd(@Args('id') id: string, @Args('contact') contact: Record<string, any>) {
    try {
      return { company: await this.service.addCompanyContact(id, contact), userErrors: [] }
    } catch (e) {
      return { company: null, userErrors: [{ field: ['contact'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async priceListCreate(@Args('input') input: Record<string, any>) {
    try {
      return { priceList: await this.service.createPriceList(input), userErrors: [] }
    } catch (e) {
      return { priceList: null, userErrors: [{ field: ['input'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async priceListUpdate(@Args('id') id: string, @Args('input') input: Record<string, any>) {
    try {
      return { priceList: await this.service.updatePriceList(id, input), userErrors: [] }
    } catch (e) {
      return { priceList: null, userErrors: [{ field: ['input'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async priceListDelete(@Args('id') id: string) {
    try {
      return { deletedId: await this.service.deletePriceList(id), userErrors: [] }
    } catch (e) {
      return { deletedId: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async segmentCreate(@Args('segment') segment: Record<string, any>) {
    try {
      return { segment: await this.service.createSegment(segment), userErrors: [] }
    } catch (e) {
      return { segment: null, userErrors: [{ field: ['segment'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async segmentUpdate(@Args('id') id: string, @Args('segment') segment: Record<string, any>) {
    try {
      return { segment: await this.service.updateSegment(id, segment), userErrors: [] }
    } catch (e) {
      return { segment: null, userErrors: [{ field: ['segment'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  segmentDelete(@Args('id') id: string) {
    return { deletedIds: this.service.deleteSegment(id), userErrors: [] }
  }
}

@Module({
  imports: [PrismaModule],
  providers: [CustomersResolver, CustomersService],
})
export class CustomersModule {}
