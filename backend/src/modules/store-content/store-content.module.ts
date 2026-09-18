import { Injectable, Module } from '@nestjs/common'
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql'
import { PrismaService } from '../../prisma/prisma.service'
import { PrismaModule } from '../../prisma/prisma.module'
import { parseJson, toJson } from '../../common/helpers'
import { mapCustomer } from '../../common/mappers'
import { uid, slugify, roundMoney } from '../../common/ids'
import { actorId, actorName } from '../../auth/actor'
import { AuthorizationService } from '../../auth/authorization.service'
import { AuthModule } from '../../auth/auth.module'
import { currentStaff } from '../../auth/staff-context'

// Consolidated store/content/metafields/staff/system module.
// Pages, blog posts, files, menus, redirects, metaobjects, metafields,
// staff, activity, notifications, tasks, apps, settings, theme, locales,
// markets, plan, bootstrap snapshot.

@Injectable()
export class StoreContentService {
  constructor(
    private prisma: PrismaService,
    private authz: AuthorizationService,
  ) {}

  private async logActivity(action: string, resource: string, resourceId?: string) {
    await this.prisma.activityEntry.create({
      data: { id: uid('act'), at: new Date(), staffId: actorId(), staffName: actorName(), action, resource, resourceId: resourceId ?? null },
    })
  }

  // pages
  async pages() {
    return this.prisma.storePage.findMany({ orderBy: { title: 'asc' } })
  }
  async page(id: string) {
    return this.prisma.storePage.findUnique({ where: { id } })
  }
  async createPage(input: Record<string, any>) {
    const title = input.title?.trim() || 'Untitled page'
    if (await this.prisma.storePage.findUnique({ where: { handle: slugify(title) } })) {
      throw new Error('A page with this handle already exists')
    }
    const now = new Date()
    const row = await this.prisma.storePage.create({
      data: {
        id: uid('page'), title, contentHtml: input.contentHtml ?? '<p></p>',
        handle: slugify(title), status: input.status ?? 'draft',
        seoTitle: input.seoTitle ?? title, seoDescription: input.seoDescription ?? null,
        createdAt: now, updatedAt: now,
      },
    })
    await this.logActivity('Created page', 'page', row.id)
    return row
  }
  async updatePage(id: string, input: Record<string, any>) {
    const existing = await this.prisma.storePage.findUnique({ where: { id } })
    if (!existing) throw new Error('Page not found')
    const data: Record<string, unknown> = { updatedAt: new Date() }
    for (const key of ['title', 'contentHtml', 'handle', 'status', 'seoTitle', 'seoDescription']) {
      if (input[key] !== undefined) data[key] = key === 'handle' ? slugify(input[key]) : input[key]
    }
    await this.prisma.storePage.update({ where: { id }, data })
    return this.page(id)
  }
  async deletePages(ids: string[]): Promise<string[]> {
    await this.prisma.storePage.deleteMany({ where: { id: { in: ids } } })
    return ids
  }

  // blog posts
  async blogPosts() {
    return this.prisma.blogPost.findMany({ orderBy: { publishedAt: 'desc' } })
  }
  async blogPost(id: string) {
    return this.prisma.blogPost.findUnique({ where: { id } })
  }
  async createPost(input: Record<string, any>) {
    const row = await this.prisma.blogPost.create({
      data: {
        id: uid('post'), title: input.title?.trim() || 'Untitled post', author: input.author || 'Ava Chen',
        excerpt: input.excerpt ?? '', contentHtml: input.contentHtml ?? '<p></p>',
        imageSrc: input.imageSrc ?? null, tags: toJson(input.tags ?? []),
        status: input.status ?? 'draft', publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
      },
    })
    return row
  }
  async updatePost(id: string, input: Record<string, any>) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } })
    if (!existing) throw new Error('Post not found')
    const data: Record<string, unknown> = {}
    for (const key of ['title', 'author', 'excerpt', 'contentHtml', 'imageSrc', 'status']) {
      if (input[key] !== undefined) data[key] = input[key]
    }
    if (input.tags !== undefined) data.tags = toJson(input.tags)
    if (input.publishedAt !== undefined) data.publishedAt = input.publishedAt ? new Date(input.publishedAt) : null
    await this.prisma.blogPost.update({ where: { id }, data })
    return this.blogPost(id)
  }
  async deletePosts(ids: string[]): Promise<string[]> {
    await this.prisma.blogPost.deleteMany({ where: { id: { in: ids } } })
    return ids
  }

  // files
  async files() {
    return this.prisma.fileAsset.findMany({ orderBy: { uploadedAt: 'desc' } })
  }
  async createFile(input: any) {
    const isImage = /\.(png|jpe?g|gif|svg|webp|avif)$/i.test(input.url)
    const isVideo = /\.(mp4|webm|mov)$/i.test(input.url)
    const row = await this.prisma.fileAsset.create({
      data: {
        id: uid('file'),
        name: input.name || input.url.split('/').pop()?.split('?')[0] || 'asset',
        type: isImage ? 'image' : isVideo ? 'video' : 'document',
        src: input.url,
        sizeKb: Math.floor(Math.random() * 400) + 30,
        dimensions: isImage ? toJson({ width: 640, height: 640 }) : null,
        uploadedAt: new Date(),
        alt: null,
      },
    })
    return row
  }
  async updateFile(id: string, name?: string, alt?: string) {
    const data: Record<string, unknown> = {}
    if (name !== undefined) {
      if (!name.trim()) throw new Error('File name cannot be empty')
      data.name = name.trim()
    }
    if (alt !== undefined) data.alt = alt
    await this.prisma.fileAsset.update({ where: { id }, data })
    return this.prisma.fileAsset.findUnique({ where: { id } })
  }
  async deleteFiles(ids: string[]): Promise<string[]> {
    await this.prisma.fileAsset.deleteMany({ where: { id: { in: ids } } })
    return ids
  }

  // menus
  async menus() {
    const rows = await this.prisma.navMenu.findMany()
    return rows.map((r) => ({ ...r, items: parseJson(r.items as string, []) }))
  }
  async menu(handle: string) {
    const row = await this.prisma.navMenu.findUnique({ where: { handle } })
    return row ? { ...row, items: parseJson(row.items as string, []) } : null
  }
  async updateMenu(handle: string, items: unknown[]) {
    await this.prisma.navMenu.update({ where: { handle }, data: { items: toJson(items) } })
    return this.menu(handle)
  }

  // redirects
  async redirects() {
    return this.prisma.redirect.findMany({ orderBy: { createdAt: 'desc' } })
  }
  async createRedirect(input: any) {
    const from = `/${slugify(input.from).replace(/^\//, '')}`
    if (await this.prisma.redirect.findUnique({ where: { from } })) throw new Error('A redirect for this URL already exists')
    if (!input.to.trim()) throw new Error('Target URL is required')
    return this.prisma.redirect.create({ data: { id: uid('red'), from, to: input.to.trim(), createdAt: new Date() } })
  }
  async updateRedirect(id: string, input: any) {
    const existing = await this.prisma.redirect.findUnique({ where: { id } })
    if (!existing) throw new Error('Redirect not found')
    const from = `/${slugify(input.from).replace(/^\//, '')}`
    const dup = await this.prisma.redirect.findUnique({ where: { from } })
    if (dup && dup.id !== id) throw new Error('A redirect for this URL already exists')
    return this.prisma.redirect.update({ where: { id }, data: { from, to: input.to.trim() } })
  }
  async deleteRedirect(id: string): Promise<string[]> {
    await this.prisma.redirect.delete({ where: { id } })
    return [id]
  }

  // metaobjects
  async metaobjectDefinitions() {
    const rows = await this.prisma.metaobjectDefinition.findMany()
    return rows.map((r) => ({ ...r, fields: parseJson(r.fields as string, []) }))
  }
  async metaobjectEntries(definitionId?: string) {
    const rows = await this.prisma.metaobjectEntry.findMany({ where: definitionId ? { definitionId } : undefined, orderBy: { updatedAt: 'desc' } })
    return rows.map((r) => ({ ...r, fields: parseJson(r.fields as string, {}) }))
  }
  async createMetaobjectEntry(input: any) {
    const row = await this.prisma.metaobjectEntry.create({
      data: { id: uid('mod_e'), definitionId: input.definitionId, fields: toJson(input.fields ?? {}), status: input.status ?? 'draft', updatedAt: new Date() },
    })
    return { ...row, fields: parseJson(row.fields as string, {}) }
  }
  async updateMetaobjectEntry(id: string, input: { definitionId?: string; fields?: unknown; status?: string }) {
    const existing = await this.prisma.metaobjectEntry.findUnique({ where: { id } })
    if (!existing) throw new Error('Entry not found')
    const data: Record<string, unknown> = { updatedAt: new Date() }
    if (input.fields !== undefined) data.fields = toJson(input.fields)
    if (input.status !== undefined) data.status = input.status
    await this.prisma.metaobjectEntry.update({ where: { id }, data })
    const row = await this.prisma.metaobjectEntry.findUnique({ where: { id } })
    return { ...row, fields: parseJson(row!.fields as string, {}) }
  }
  async deleteMetaobjectEntry(id: string): Promise<string[]> {
    await this.prisma.metaobjectEntry.delete({ where: { id } })
    return [id]
  }

  // metafields
  async metafieldDefinitions(resourceType?: string) {
    return this.prisma.metafieldDefinition.findMany(resourceType ? { where: { resourceType } } : undefined)
  }
  async createMetafieldDefinition(input: Record<string, any>) {
    if (!input.name?.trim() || !input.key?.trim()) throw new Error('Name and key are required')
    return this.prisma.metafieldDefinition.create({
      data: {
        id: uid('mfdef'),
        namespace: input.namespace?.trim() || 'custom',
        key: input.key.trim().toLowerCase().replace(/\s+/g, '_'),
        name: input.name.trim(),
        type: input.type,
        description: input.description ?? null,
        resourceType: input.resourceType,
      },
    })
  }
  async deleteMetafieldDefinition(id: string): Promise<string[]> {
    await this.prisma.metafieldDefinition.delete({ where: { id } })
    return [id]
  }
  async metafields(ownerType: string, ownerId: string) {
    return this.prisma.metafield.findMany({ where: { ownerType, ownerId } })
  }
  async setMetafields(metafields: { ownerType: string; ownerId: string; definitionId: string; value: string }[]) {
    const result = []
    for (const m of metafields) {
      const existing = await this.prisma.metafield.findUnique({
        where: { ownerType_ownerId_definitionId: { ownerType: m.ownerType, ownerId: m.ownerId, definitionId: m.definitionId } },
      })
      if (existing) {
        if (m.value === '') {
          await this.prisma.metafield.delete({ where: { id: existing.id } })
        } else {
          result.push(await this.prisma.metafield.update({ where: { id: existing.id }, data: { value: m.value } }))
        }
      } else if (m.value !== '') {
        result.push(await this.prisma.metafield.create({ data: { id: uid('mf'), ...m } }))
      }
    }
    return result
  }

  // staff
  async staff() {
    const rows = await this.prisma.staffMember.findMany({ orderBy: { email: 'asc' } })
    return rows.map((r) => ({ ...r, permissions: parseJson(r.permissions as string, {}) }))
  }
  async createStaff(input: any) {
    if (await this.prisma.staffMember.findUnique({ where: { email: input.email } })) {
      throw new Error('Someone with this email already has access')
    }
    const row = await this.prisma.staffMember.create({
      data: {
        id: uid('staff'), name: input.name, email: input.email, role: input.role ?? 'staff',
        status: 'invited', lastActiveAt: null,
        permissions: toJson({ products: ['view'], orders: ['view'], customers: ['view'], analytics: [], settings: [] }),
      },
    })
    await this.logActivity('Invited staff', 'staff', row.id)
    return { ...row, permissions: parseJson(row.permissions as string, {}) }
  }
  async updateStaff(id: string, input: any) {
    await this.authz.assertStaffUpdateAllowed(currentStaff(), id, input)
    const member = await this.prisma.staffMember.findUnique({ where: { id } })
    if (!member) throw new Error('Staff member not found')
    const data: Record<string, unknown> = {}
    for (const key of ['role', 'name', 'email']) if (input[key] !== undefined) data[key] = input[key]
    await this.prisma.staffMember.update({ where: { id }, data })
    const row = await this.prisma.staffMember.findUnique({ where: { id } })
    return { ...row, permissions: parseJson(row!.permissions as string, {}) }
  }
  async setStaffPermissions(id: string, resource: string, actions: string[]) {
    const member = await this.prisma.staffMember.findUnique({ where: { id } })
    if (!member) throw new Error('Staff member not found')
    const permissions = parseJson<Record<string, string[]>>(member.permissions as string, {})
    permissions[resource] = actions
    await this.prisma.staffMember.update({ where: { id }, data: { permissions: toJson(permissions) } })
    const row = await this.prisma.staffMember.findUnique({ where: { id } })
    return { ...row, permissions: parseJson(row!.permissions as string, {}) }
  }
  async setStaffStatus(id: string, status: string) {
    const member = await this.prisma.staffMember.findUnique({ where: { id } })
    if (!member) throw new Error('Staff member not found')
    if (member.role === 'owner') throw new Error('The store owner’s access cannot be changed')
    await this.prisma.staffMember.update({ where: { id }, data: { status } })
    const row = await this.prisma.staffMember.findUnique({ where: { id } })
    return { ...row, permissions: parseJson(row!.permissions as string, {}) }
  }
  async deleteStaff(id: string): Promise<string[]> {
    const member = await this.prisma.staffMember.findUnique({ where: { id } })
    if (member?.role === 'owner') throw new Error('The store owner cannot be removed')
    await this.prisma.staffMember.delete({ where: { id } })
    return [id]
  }

  async activity(first: number) {
    return this.prisma.activityEntry.findMany({ orderBy: { at: 'desc' }, take: first })
  }

  // notifications + tasks
  async notifications() {
    return this.prisma.notification.findMany({ orderBy: { createdAt: 'desc' } })
  }
  async markNotificationRead(id: string) {
    await this.prisma.notification.update({ where: { id }, data: { read: true } })
    return this.settingsSingleton()
  }
  async markAllNotificationsRead() {
    await this.prisma.notification.updateMany({ data: { read: true } })
    return this.settingsSingleton()
  }
  async tasks() {
    return this.prisma.task.findMany()
  }
  async toggleTask(id: string) {
    const t = await this.prisma.task.findUnique({ where: { id } })
    if (t) await this.prisma.task.update({ where: { id }, data: { done: !t.done } })
    return this.settingsSingleton()
  }

  // apps
  async apps() {
    const rows = await this.prisma.appEntry.findMany()
    return rows.map((r) => ({ ...r, permissions: parseJson<string[]>(r.permissions as string, []) }))
  }
  async installApp(id: string) {
    const suggestion = await this.prisma.appEntry.findUnique({ where: { id } })
    if (!suggestion) throw new Error('App not found')
    const row = await this.prisma.appEntry.create({
      data: { id: uid('app'), name: suggestion.name, description: suggestion.description, iconBg: suggestion.iconBg, iconChar: suggestion.iconChar, status: 'installed', permissions: toJson(suggestion.permissions), category: suggestion.category, suggested: false },
    })
    return { ...row, permissions: parseJson<string[]>(row.permissions as string, []) }
  }
  async uninstallApp(id: string): Promise<string[]> {
    await this.prisma.appEntry.delete({ where: { id } })
    return [id]
  }
  async toggleApp(id: string) {
    const app = await this.prisma.appEntry.findUnique({ where: { id } })
    if (!app) throw new Error('App not found')
    await this.prisma.appEntry.update({ where: { id }, data: { status: app.status === 'installed' ? 'disabled' : 'installed' } })
    const row = await this.prisma.appEntry.findUnique({ where: { id } })
    return { ...row, permissions: parseJson<string[]>(row!.permissions as string, []) }
  }

  // settings / theme / locales / markets / plan
  async settingsSingleton() {
    const row = await this.prisma.storeSettings.findUnique({ where: { id: 'singleton' } })
    const value = parseJson<Record<string, any>>(row?.value as string, {})
    return { id: 'singleton', storeName: value.storeName ?? '', legalName: value.legalName ?? '', email: value.email ?? '', phone: value.phone ?? '', currency: value.currency ?? 'USD', timezone: value.timezone ?? '', value }
  }
  async updateSettings(value: Record<string, any>) {
    await this.prisma.storeSettings.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', value: toJson(value) }, update: { value: toJson(value) } })
    return this.settingsSingleton()
  }
  async theme() {
    const row = await this.prisma.theme.findUnique({ where: { id: 'singleton' } })
    const value = parseJson<Record<string, any>>(row?.value as string, { activeTheme: 'Northstar' })
    return { id: 'singleton', activeTheme: value.activeTheme ?? 'Northstar', value }
  }
  async updateTheme(value: Record<string, any>) {
    await this.prisma.theme.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', value: toJson(value) }, update: { value: toJson(value) } })
    return this.theme()
  }
  async themeLibrary() {
    return this.prisma.themeLibraryEntry.findMany({ orderBy: { addedAt: 'desc' } })
  }
  async publishTheme(id: string) {
    const theme = await this.prisma.themeLibraryEntry.findUnique({ where: { id } })
    if (!theme) throw new Error('Theme not found')
    const entries = await this.prisma.themeLibraryEntry.findMany()
    for (const entry of entries) {
      const role = entry.id === id ? 'current' : entry.role === 'current' ? 'published-mirror' : entry.role
      await this.prisma.themeLibraryEntry.update({ where: { id: entry.id }, data: { role } })
    }
    const t = await this.theme()
    await this.updateTheme({ ...t.value, activeTheme: theme.name })
    return this.settingsSingleton()
  }
  async addTheme(name: string) {
    return this.prisma.themeLibraryEntry.create({
      data: { id: uid('th'), name, version: '1.0.0', role: 'library', imageSrc: `/images/banners/theme-${slugify(name)}.svg`, addedAt: new Date() },
    })
  }
  async deleteTheme(id: string): Promise<string[]> {
    const theme = await this.prisma.themeLibraryEntry.findUnique({ where: { id } })
    if (theme?.role === 'current') throw new Error('Cannot delete the live theme')
    await this.prisma.themeLibraryEntry.delete({ where: { id } })
    return [id]
  }
  async locales() {
    return this.prisma.locale.findMany()
  }
  async addLocale(code: string, name: string) {
    await this.prisma.locale.create({ data: { code, name, isDefault: false, published: true } })
    return this.settingsSingleton()
  }
  async removeLocale(code: string) {
    await this.prisma.locale.delete({ where: { code } })
    return this.settingsSingleton()
  }
  async markets() {
    return this.prisma.marketCountry.findMany()
  }
  async updateMarket(code: string, priceAdjustmentPercent?: number, enabled?: boolean) {
    const data: Record<string, unknown> = {}
    if (priceAdjustmentPercent !== undefined) data.priceAdjustmentPercent = priceAdjustmentPercent
    if (enabled !== undefined) data.enabled = enabled
    await this.prisma.marketCountry.update({ where: { code }, data })
    return this.prisma.marketCountry.findUnique({ where: { code } })
  }
  async plan() {
    return this.prisma.plan.findUnique({ where: { id: 'singleton' } })
  }
  async shop() {
    const settings = await this.settingsSingleton()
    const plan = await this.plan()
    return { id: 'singleton', name: settings.storeName, email: settings.email, currency: settings.currency, plan }
  }

  // bootstrap snapshot
  async snapshot(): Promise<any> {
    const [products, customersRaw, orders, abandonedCheckouts, collections, locations, inventoryLevels, inventoryHistory, discounts, campaigns, staff, pages, blogPosts, files, menus, apps, notifications, tasks, theme, themeLibrary, companies, segments, transfers, giftCards, payouts, balanceTransactions, metafieldDefinitions, metafields, redirects, locales, markets, activity, returns, orderEdits, planRow, settings, themeSingleton] =
      await Promise.all([
        this.prisma.product.findMany({ orderBy: { updatedAt: 'desc' } }),
        this.prisma.customer.findMany({}),
        this.orders(),
        this.prisma.abandonedCheckout.findMany({ orderBy: { createdAt: 'desc' } }),
        this.collections(),
        this.prisma.location.findMany(),
        this.levels(),
        this.prisma.inventoryHistory.findMany({ orderBy: { createdAt: 'desc' } }),
        this.discounts(),
        this.prisma.campaign.findMany(),
        this.staff(),
        this.pages(),
        this.blogPosts(),
        this.files(),
        this.menus(),
        this.apps(),
        this.notifications(),
        this.tasks(),
        this.theme(),
        this.themeLibrary(),
        this.prisma.company.findMany({ orderBy: { name: 'asc' } }),
        this.prisma.segment.findMany(),
        this.prisma.transfer.findMany({ orderBy: { createdAt: 'desc' } }),
        this.prisma.giftCard.findMany({ orderBy: { createdAt: 'desc' } }),
        this.prisma.payout.findMany({ orderBy: { issuedAt: 'desc' } }),
        this.prisma.balanceTransaction.findMany({ orderBy: { at: 'desc' } }),
        this.metafieldDefinitions(),
        this.prisma.metafield.findMany(),
        this.redirects(),
        this.locales(),
        this.markets(),
        this.activity(200),
        this.prisma.returnRecord.findMany({ orderBy: { createdAt: 'desc' } }),
        this.prisma.orderEdit.findMany({ orderBy: { at: 'desc' } }),
        this.plan(),
        this.settingsSingleton(),
        this.theme(),
      ])
    const decoratedProducts: any[] = []
    const levels = inventoryLevels
    for (const p of products) {
      const variants = parseJson<{ id: string }[]>(p.variants as string, [])
      decoratedProducts.push({
        ...mapProductLike(p),
        totalInventory: p.trackQuantity ? variants.reduce((s, v) => s + (levels.find((l) => l.variantId === v.id)?.available ?? 0), 0) : 0,
      })
    }
    const riskRows = await this.prisma.orderRisk.findMany()
    const decoratedOrders = (orders as Record<string, unknown>[]).map((o) => {
      const risk = riskRows.find((r) => r.orderId === o.id)
      return {
        ...o,
        lineItems: parseJson(o.lineItems as string, []),
        shippingAddress: parseJson(o.shippingAddress as string, {}),
        billingAddress: parseJson(o.billingAddress as string, {}),
        discountCode: parseJson(o.discountCode as string, null),
        tags: parseJson(o.tags as string, []),
        timeline: parseJson(o.timeline as string, []),
        fulfillments: parseJson(o.fulfillments as string, []),
        refunds: parseJson(o.refunds as string, []),
        riskLevel: risk?.level ?? null,
        riskSignals: parseJson<string[]>(risk?.signals as string, []),
      }
    })
    const customerOrders = await this.prisma.order.findMany({ where: { status: { notIn: ['draft', 'cancelled'] } }, select: { customerId: true, total: true, createdAt: true } })
    // evaluate segment membership server-side
    const segmentRows = await this.prisma.segment.findMany()
    const segmentRowsEvaluated = await Promise.all(
      segmentRows.map(async (sg: any) => {
        const filters = parseJson<{ column: string; relation: string; value: string }[]>(sg.filters as string, [])
        const members = (customersRaw as Record<string, unknown>[]).filter((c) => {
          const stats = {
            ordersCount: customerOrders.filter((o: any) => o.customerId === c.id).length,
            totalSpent: roundMoney(customerOrders.filter((o: any) => o.customerId === c.id).reduce((s2: number, o: any) => s2 + o.total, 0)),
          }
          return filters.every((f) => {
            const actual =
              f.column === 'orders_count' ? stats.ordersCount
              : f.column === 'total_spent' ? stats.totalSpent
              : f.column === 'tag' ? parseJson<string[]>(c.tags as string, []).join('|').toLowerCase()
              : f.column === 'email_state' ? c.emailMarketingConsent
              : f.column === 'city' ? (parseJson<{ city?: string }>(c.defaultAddress as string, {})?.city ?? '')
              : (parseJson<{ country?: string }>(c.defaultAddress as string, {})?.country ?? '')
            const value = f.value.trim().toLowerCase()
            const numeric = Number(value)
            switch (f.relation) {
              case 'gt': return !Number.isNaN(numeric) && Number(actual) > numeric
              case 'lt': return !Number.isNaN(numeric) && Number(actual) < numeric
              case 'equals': return String(actual).toLowerCase() === value
              case 'contains': return String(actual).toLowerCase().includes(value)
              default: return false
            }
          })
        }).length
        return { ...sg, filters: parseJson(sg.filters as string, []), memberCount: members }
      }),
    )
    const customersDecorated = (customersRaw as Record<string, unknown>[]).map((c: any) => {
      const mine = customerOrders.filter((o) => o.customerId === c.id)
      const sorted = mine.sort((a, b) => b.createdAt.toISOString().localeCompare(a.createdAt.toISOString()))
      const stats = { ordersCount: mine.length, totalSpent: roundMoney(mine.reduce((s2, o) => s2 + o.total, 0)), lastOrderAt: sorted[0]?.createdAt ?? null }
      return mapCustomer(c, stats)
    })
    return {
      products: decoratedProducts,
      customers: customersDecorated,
      orders: decoratedOrders,
      abandonedCheckouts: abandonedCheckouts.map((a) => ({ ...a, lineItems: parseJson(a.lineItems as string, []) })),
      collections: collections.map((c: any) => ({ ...c, rules: parseJson(c.rules as string, []), productIds: parseJson(c.productIds as string, []) })),
      locations,
      inventoryLevels: levels.map((l: any) => ({ ...l, onHand: l.available + l.committed + l.unavailable })),
      inventoryHistory,
      discounts,
      campaigns,
      staff,
      pages,
      blogPosts,
      files,
      menus,
      apps,
      notifications,
      tasks,
      theme,
      themeLibrary,
      companies: companies.map((c: any) => {
        const mine = customerOrders.filter((o: any) => o.customerId === c.customerId)
        return {
          ...c,
          locations: parseJson(c.locations as string, []),
          contacts: parseJson(c.contacts as string, []),
          totalSpent: roundMoney(mine.reduce((s2: number, o: any) => s2 + o.total, 0)),
        }
      }),
      segments: segmentRowsEvaluated,
      transfers: transfers.map((t: any) => ({ ...t, lines: parseJson(t.lines as string, []) })),
      giftCards: giftCards.map((g: any) => ({ ...g, history: parseJson(g.history as string, []) })),
      payouts,
      balanceTransactions,
      metafieldDefinitions,
      metafields,
      redirects,
      locales,
      markets,
      activity,
      returns: returns.map((r: any) => ({ ...r, lines: parseJson(r.lines as string, []) })),
      orderEdits: orderEdits.map((e: any) => ({ ...e, added: parseJson(e.added as string, []), removed: parseJson(e.removed as string, []) })),
      plan: planRow,
      settings,
      themeLibraryAll: themeLibrary,
    }
  }

  // helpers reused by snapshot
  async orders(): Promise<any[]> {
    const rows = await this.prisma.order.findMany({ orderBy: { createdAt: 'desc' } })
    const riskRows = await this.prisma.orderRisk.findMany()
    return rows.map((o) => {
      const risk = riskRows.find((r) => r.orderId === o.id)
      return {
        ...o,
        lineItems: parseJson(o.lineItems as string, []),
        shippingAddress: parseJson(o.shippingAddress as string, {}),
        billingAddress: parseJson(o.billingAddress as string, {}),
        discountCode: parseJson(o.discountCode as string, null),
        tags: parseJson(o.tags as string, []),
        timeline: parseJson(o.timeline as string, []),
        fulfillments: parseJson(o.fulfillments as string, []),
        refunds: parseJson(o.refunds as string, []),
        riskLevel: risk?.level ?? null,
        riskSignals: parseJson<string[]>(risk?.signals as string, []),
      }
    })
  }
  async collections(): Promise<any[]> {
    const rows = await this.prisma.collection.findMany({ orderBy: { title: 'asc' } })
    return rows.map((r) => ({ ...r, rules: parseJson(r.rules as string, []), productIds: parseJson(r.productIds as string, []) }))
  }
  async levels(): Promise<any[]> {
    const rows = await this.prisma.inventoryLevel.findMany()
    return rows.map((l) => ({ ...l, onHand: l.available + l.committed + l.unavailable }))
  }
  async discounts(): Promise<any[]> {
    const rows = await this.prisma.discount.findMany({ orderBy: { startsAt: 'desc' } })
    return rows.map((r) => ({
      ...r,
      productIds: parseJson(r.productIds as string, []),
      bxgy: parseJson(r.bxgy as string, null),
      combinations: parseJson(r.combinations as string, { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false }),
    }))
  }
  async companiesAll(): Promise<any[]> {
    const rows = await this.prisma.company.findMany({ orderBy: { name: 'asc' } })
    return rows.map((r) => ({ ...r, locations: parseJson(r.locations as string, []), contacts: parseJson(r.contacts as string, []) }))
  }
  async giftCardsAll(): Promise<any[]> {
    const rows = await this.prisma.giftCard.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map((r) => ({ ...r, history: parseJson(r.history as string, []) }))
  }
}

function mapProductLike(p: Record<string, unknown>): Record<string, unknown> {
  return {
    ...p,
    tags: parseJson(p.tags as string, []),
    collectionIds: parseJson(p.collectionIds as string, []),
    channels: parseJson(p.channels as string, []),
    options: parseJson(p.options as string, []),
    variants: parseJson(p.variants as string, []),
    media: parseJson(p.media as string, []),
    seo: parseJson(p.seo as string, {}),
  }
}

@Resolver('StorePage')
export class StoreContentResolver {
  constructor(private readonly service: StoreContentService) {}

  @Query()
  pages() {
    return this.service.pages()
  }
  @Query()
  page(@Args('id') id: string) {
    return this.service.page(id)
  }
  @Query()
  blogPosts() {
    return this.service.blogPosts()
  }
  @Query()
  blogPost(@Args('id') id: string) {
    return this.service.blogPost(id)
  }
  @Query()
  files() {
    return this.service.files()
  }
  @Query()
  menus() {
    return this.service.menus()
  }
  @Query()
  menu(@Args('handle') handle: string) {
    return this.service.menu(handle)
  }
  @Query()
  redirects() {
    return this.service.redirects()
  }
  @Query()
  metaobjectDefinitions() {
    return this.service.metaobjectDefinitions()
  }
  @Query()
  metaobjectEntries(@Args('definitionId', { nullable: true }) definitionId?: string) {
    return this.service.metaobjectEntries(definitionId)
  }
  @Query()
  metafieldDefinitions(@Args('resourceType', { nullable: true }) resourceType?: string) {
    return this.service.metafieldDefinitions(resourceType)
  }
  @Query()
  metafields(@Args('ownerType') ownerType: string, @Args('ownerId') ownerId: string) {
    return this.service.metafields(ownerType, ownerId)
  }
  @Query()
  staff() {
    return this.service.staff()
  }
  @Query()
  activity(@Args('first', { nullable: true }) first: number) {
    return this.service.activity(first ?? 50)
  }
  @Query()
  apps() {
    return this.service.apps()
  }
  @Query()
  notifications() {
    return this.service.notifications()
  }
  @Query()
  tasks() {
    return this.service.tasks()
  }
  @Query()
  settings() {
    return this.service.settingsSingleton()
  }
  @Query()
  theme() {
    return this.service.theme()
  }
  @Query()
  themeLibrary() {
    return this.service.themeLibrary()
  }
  @Query()
  locales() {
    return this.service.locales()
  }
  @Query()
  markets() {
    return this.service.markets()
  }
  @Query()
  plan() {
    return this.service.plan()
  }
  @Query()
  shop() {
    return this.service.shop()
  }
  @Query()
  bootstrap() {
    return this.service.snapshot()
  }

  @Mutation()
  async pageCreate(@Args('page') page: Record<string, any>) {
    try {
      return { page: await this.service.createPage(page), userErrors: [] }
    } catch (e) {
      return { page: null, userErrors: [{ field: ['page'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async pageUpdate(@Args('id') id: string, @Args('page') page: Record<string, any>) {
    try {
      return { page: await this.service.updatePage(id, page), userErrors: [] }
    } catch (e) {
      return { page: null, userErrors: [{ field: ['page'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  pageDelete(@Args('ids') ids: string[]) {
    return { updatedIds: this.service.deletePages(ids), userErrors: [] }
  }
  @Mutation()
  async blogPostCreate(@Args('post') post: Record<string, any>) {
    try {
      return { post: await this.service.createPost(post), userErrors: [] }
    } catch (e) {
      return { post: null, userErrors: [{ field: ['post'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async blogPostUpdate(@Args('id') id: string, @Args('post') post: Record<string, any>) {
    try {
      return { post: await this.service.updatePost(id, post), userErrors: [] }
    } catch (e) {
      return { post: null, userErrors: [{ field: ['post'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  blogPostDelete(@Args('ids') ids: string[]) {
    return { updatedIds: this.service.deletePosts(ids), userErrors: [] }
  }
  @Mutation()
  async fileCreate(@Args('input') input: Record<string, any>) {
    try {
      return { file: await this.service.createFile(input), userErrors: [] }
    } catch (e) {
      return { file: null, userErrors: [{ field: ['input'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async fileUpdate(@Args('id') id: string, @Args('name', { nullable: true }) name?: string, @Args('alt', { nullable: true }) alt?: string) {
    try {
      return { file: await this.service.updateFile(id, name, alt), userErrors: [] }
    } catch (e) {
      return { file: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  fileDelete(@Args('ids') ids: string[]) {
    return { updatedIds: this.service.deleteFiles(ids), userErrors: [] }
  }
  @Mutation()
  async menuUpdate(@Args('handle') handle: string, @Args('items') items: unknown[]) {
    try {
      return { menu: await this.service.updateMenu(handle, items), userErrors: [] }
    } catch (e) {
      return { menu: null, userErrors: [{ field: ['items'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async redirectCreate(@Args('redirect') redirect: Record<string, any>) {
    try {
      return { redirect: await this.service.createRedirect(redirect), userErrors: [] }
    } catch (e) {
      return { redirect: null, userErrors: [{ field: ['redirect'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async redirectUpdate(@Args('id') id: string, @Args('redirect') redirect: Record<string, any>) {
    try {
      return { redirect: await this.service.updateRedirect(id, redirect), userErrors: [] }
    } catch (e) {
      return { redirect: null, userErrors: [{ field: ['redirect'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  redirectDelete(@Args('id') id: string) {
    return { updatedIds: this.service.deleteRedirect(id), userErrors: [] }
  }
  @Mutation()
  async metaobjectEntryCreate(@Args('entry') entry: Record<string, any>) {
    try {
      return { entry: await this.service.createMetaobjectEntry(entry), userErrors: [] }
    } catch (e) {
      return { entry: null, userErrors: [{ field: ['entry'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async metaobjectEntryUpdate(@Args('id') id: string, @Args('entry') entry: Record<string, any>) {
    try {
      return { entry: await this.service.updateMetaobjectEntry(id, entry), userErrors: [] }
    } catch (e) {
      return { entry: null, userErrors: [{ field: ['entry'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  metaobjectEntryDelete(@Args('id') id: string) {
    return { updatedIds: this.service.deleteMetaobjectEntry(id), userErrors: [] }
  }
  @Mutation()
  async metafieldDefinitionCreate(@Args('definition') definition: Record<string, any>) {
    try {
      return { definition: await this.service.createMetafieldDefinition(definition), userErrors: [] }
    } catch (e) {
      return { definition: null, userErrors: [{ field: ['definition'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  metafieldDefinitionDelete(@Args('id') id: string) {
    return { updatedIds: this.service.deleteMetafieldDefinition(id), userErrors: [] }
  }
  @Mutation()
  async metafieldsSet(@Args('metafields') metafields: Record<string, any>[]) {
    try {
      return { metafields: await this.service.setMetafields(metafields as never), userErrors: [] }
    } catch (e) {
      return { metafields: [], userErrors: [{ field: ['metafields'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async staffMemberCreate(@Args('input') input: Record<string, any>) {
    try {
      return { staffMember: await this.service.createStaff(input), userErrors: [] }
    } catch (e) {
      return { staffMember: null, userErrors: [{ field: ['input'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async staffMemberUpdate(@Args('id') id: string, @Args() input: Record<string, any>) {
    try {
      return { staffMember: await this.service.updateStaff(id, input), userErrors: [] }
    } catch (e) {
      return { staffMember: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async staffMemberPermissionSet(@Args('id') id: string, @Args('resource') resource: string, @Args('actions') actions: string[]) {
    try {
      return { staffMember: await this.service.setStaffPermissions(id, resource, actions), userErrors: [] }
    } catch (e) {
      return { staffMember: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async staffMemberSetStatus(@Args('id') id: string, @Args('status') status: string) {
    try {
      return { staffMember: await this.service.setStaffStatus(id, status), userErrors: [] }
    } catch (e) {
      return { staffMember: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  staffMemberDelete(@Args('id') id: string) {
    return { updatedIds: this.service.deleteStaff(id), userErrors: [] }
  }
  @Mutation()
  async appInstall(@Args('id') id: string) {
    try {
      return { app: await this.service.installApp(id), userErrors: [] }
    } catch (e) {
      return { app: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  appUninstall(@Args('id') id: string) {
    return { updatedIds: this.service.uninstallApp(id), userErrors: [] }
  }
  @Mutation()
  async appToggle(@Args('id') id: string) {
    try {
      return { app: await this.service.toggleApp(id), userErrors: [] }
    } catch (e) {
      return { app: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  settingsUpdate(@Args('value') value: Record<string, any>) {
    return this.service.updateSettings(value)
  }
  @Mutation()
  themeUpdate(@Args('value') value: Record<string, any>) {
    return this.service.updateTheme(value)
  }
  @Mutation()
  themePublish(@Args('id') id: string) {
    return this.service.publishTheme(id)
  }
  @Mutation()
  themeLibraryAdd(@Args('name') name: string) {
    return this.service.addTheme(name)
  }
  @Mutation()
  themeLibraryDelete(@Args('id') id: string) {
    return this.service.deleteTheme(id).then(() => this.service.settingsSingleton())
  }
  @Mutation()
  localeAdd(@Args('code') code: string, @Args('name') name: string) {
    return this.service.addLocale(code, name)
  }
  @Mutation()
  localeRemove(@Args('code') code: string) {
    return this.service.removeLocale(code)
  }
  @Mutation()
  marketUpdate(@Args('code') code: string, @Args('priceAdjustmentPercent', { nullable: true }) priceAdjustmentPercent?: number, @Args('enabled', { nullable: true }) enabled?: boolean) {
    return this.service.updateMarket(code, priceAdjustmentPercent, enabled)
  }
  @Mutation()
  notificationMarkRead(@Args('id') id: string) {
    return this.service.markNotificationRead(id)
  }
  @Mutation()
  notificationMarkAllRead() {
    return this.service.markAllNotificationsRead()
  }
  @Mutation()
  taskToggle(@Args('id') id: string) {
    return this.service.toggleTask(id)
  }
  @Mutation()
  resetDemoData() {
    return this.service.settingsSingleton()
  }
}

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [StoreContentResolver, StoreContentService],
})
export class StoreContentModule {}
