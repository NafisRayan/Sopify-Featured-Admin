import { Injectable, Module } from '@nestjs/common'
import { Resolver, Query, Mutation, Args, ResolveField } from '@nestjs/graphql'
import { PrismaService } from '../../prisma/prisma.service'
import { PrismaModule } from '../../prisma/prisma.module'
import { parseJson, toJson } from '../../common/helpers'
import {
  mapProduct,
  mapCollection,
  mapCustomer,
  mapOrder,
  mapCompany,
  mapSegment,
  mapTransfer,
  mapDiscount,
  mapGiftCard,
  mapMenu,
  mapFile,
  mapStaff,
  mapMetaobjectDefinition,
  mapMetaobjectEntry,
  mapOrderRisk,
} from '../../common/mappers'
import { uid, slugify, roundMoney } from '../../common/ids'
import { actorId, actorName } from '../../auth/actor'
import { AuthorizationService } from '../../auth/authorization.service'
import { AuthModule } from '../../auth/auth.module'
import { currentStaff } from '../../auth/staff-context'

import { OrdersService } from '../orders/orders.service'
import { OrdersModule } from '../orders/orders.module'
import { reseed } from '../../seed/seed-core'
import { ensurePayouts } from '../finances/finances.module'
// Consolidated store/content/metafields/staff/system module.
// Pages, blog posts, files, menus, redirects, metaobjects, metafields,
// staff, activity, notifications, tasks, apps, settings, theme, locales,
// markets, plan, bootstrap snapshot.

@Injectable()
export class StoreContentService {
  constructor(
    private prisma: PrismaService,
    private authz: AuthorizationService,
    private ordersService?: OrdersService,
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
    // Shallow merge: partial updates must not wipe unrelated settings keys
    // (policies, domains, payouts, shipping, taxes…).
    const current = parseJson<Record<string, any>>((await this.prisma.storeSettings.findUnique({ where: { id: 'singleton' } }))?.value as string, {})
    const merged = { ...current, ...value }
    await this.prisma.storeSettings.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', value: toJson(merged) }, update: { value: toJson(merged) } })
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

  // shop policies / domains / saved searches / counts
  async shopPolicies(): Promise<Record<string, unknown>> {
    const settings = await this.settingsSingleton()
    return parseJson<Record<string, unknown>>(settings.value?.policies as string, {})
  }
  async domains(): Promise<Record<string, any>[]> {
    const settings = await this.settingsSingleton()
    return parseJson<Record<string, any>[]>(settings.value?.domains as string, [])
  }
  async savedSearches(resourceType?: string) {
    if (resourceType) {
      return this.prisma.savedSearch.findMany({ where: { resourceType }, orderBy: { createdAt: 'desc' } })
    }
    return this.prisma.savedSearch.findMany({ orderBy: { createdAt: 'desc' } })
  }
  async pagesCount() {
    return this.prisma.storePage.count()
  }
  async blogPostsCount() {
    return this.prisma.blogPost.count()
  }
  async redirectsCount() {
    return this.prisma.redirect.count()
  }
  async currentStaffMember() {
    const session = currentStaff()
    if (!session) return null
    const member = await this.prisma.staffMember.findUnique({ where: { id: session.id } })
    return member ? { ...member, permissions: parseJson(member.permissions as string, {}) } : null
  }

  async shopPolicyUpdate(policy: string, body: string) {
    const policies: Record<string, string> = { refund: 'Refund policy', privacy: 'Privacy policy', terms: 'Terms of service', shipping: 'Shipping policy', subscriber: 'Subscriber policy' }
    if (!(policy in policies)) throw new Error(`Unknown policy: ${policy}`)
    const settings = await this.settingsSingleton()
    const value = { ...settings.value }
    const existing = parseJson<Record<string, unknown>>(value.policies as unknown as string, {})
    value.policies = { ...existing, [policy]: body }
    return this.updateSettings({ ...value, policies: value.policies })
  }

  async domainAdd(host: string) {
    const normalized = host.trim().toLowerCase()
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalized)) {
      throw new Error('Invalid hostname')
    }
    const domains = await this.domains()
    if (domains.some((d) => d.host === normalized)) throw new Error('This domain is already connected')
    domains.push({ host: normalized, primary: false, sslEnabled: false, verificationStatus: 'pending', createdAt: new Date().toISOString() })
    const settings = await this.settingsSingleton()
    await this.updateSettings({ ...settings.value, domains })
    return this.domains()
  }

  async domainSetPrimary(host: string) {
    const domains = await this.domains()
    if (!domains.some((d) => d.host === host)) throw new Error('Domain not found')
    for (const d of domains) d.primary = d.host === host
    const settings = await this.settingsSingleton()
    await this.updateSettings({ ...settings.value, domains })
    return this.domains()
  }

  async domainDelete(host: string) {
    const domains = await this.domains()
    const target = domains.find((d) => d.host === host)
    if (!target) throw new Error('Domain not found')
    if (target.primary && domains.length > 1) throw new Error('The primary domain cannot be deleted while other domains exist')
    const remaining = domains.filter((d) => d.host !== host)
    const settings = await this.settingsSingleton()
    await this.updateSettings({ ...settings.value, domains: remaining })
    return this.domains()
  }

  async localeUpdate(code: string, name: string) {
    if (!(await this.prisma.locale.findUnique({ where: { code } }))) throw new Error('Locale not found')
    await this.prisma.locale.update({ where: { code }, data: { name } })
    return this.settingsSingleton()
  }

  async marketCreate(code: string, name?: string, currency?: string) {
    if (await this.prisma.marketCountry.findUnique({ where: { code } })) throw new Error('A market with this code already exists')
    return this.prisma.marketCountry.create({
      data: { code, name: name || code, currency: currency || 'USD', priceAdjustmentPercent: 0, enabled: false },
    })
  }
  async marketDelete(code: string): Promise<string[]> {
    if (!(await this.prisma.marketCountry.findUnique({ where: { code } }))) throw new Error('Market not found')
    await this.prisma.marketCountry.delete({ where: { code } })
    return [code]
  }

  async metaobjectDefinitionCreate(definition: Record<string, any>) {
    if (!definition.name?.trim() || !Array.isArray(definition.fields) || definition.fields.length === 0) {
      throw new Error('Name and at least one field are required')
    }
    const row = await this.prisma.metaobjectDefinition.create({
      data: { id: uid('mod'), name: definition.name.trim(), fields: toJson(definition.fields) },
    })
    return { ...row, fields: parseJson(row.fields as string, []) }
  }
  async metaobjectDefinitionUpdate(id: string, definition: Record<string, any>) {
    if (!(await this.prisma.metaobjectDefinition.findUnique({ where: { id } }))) throw new Error('Definition not found')
    const data: Record<string, unknown> = {}
    if (definition.name !== undefined) data.name = definition.name
    if (definition.fields !== undefined) data.fields = toJson(definition.fields)
    await this.prisma.metaobjectDefinition.update({ where: { id }, data })
    const row = await this.prisma.metaobjectDefinition.findUnique({ where: { id } })
    return { ...row!, fields: parseJson(row!.fields as string, []) }
  }
  async metaobjectDefinitionDelete(id: string): Promise<string[]> {
    if (!(await this.prisma.metaobjectDefinition.findUnique({ where: { id } }))) throw new Error('Definition not found')
    const entries = await this.prisma.metaobjectEntry.count({ where: { definitionId: id } })
    if (entries > 0) throw new Error('Cannot delete a definition that has entries')
    await this.prisma.metaobjectDefinition.delete({ where: { id } })
    return [id]
  }

  async metafieldDefinitionUpdate(id: string, definition: Record<string, any>) {
    if (!(await this.prisma.metafieldDefinition.findUnique({ where: { id } }))) throw new Error('Definition not found')
    const data: Record<string, unknown> = {}
    for (const key of ['namespace', 'key', 'name', 'type', 'description', 'resourceType']) {
      if (definition[key] !== undefined) data[key] = definition[key]
    }
    await this.prisma.metafieldDefinition.update({ where: { id }, data })
    return this.prisma.metafieldDefinition.findUnique({ where: { id } })
  }
  async metafieldsDelete(ids: string[]): Promise<string[]> {
    await this.prisma.metafield.deleteMany({ where: { id: { in: ids } } })
    return ids
  }

  async createSavedSearch(input: Record<string, any>) {
    if (!input.name?.trim() || !input.resourceType?.trim()) throw new Error('Name and resource type are required')
    return this.prisma.savedSearch.create({
      data: { name: input.name.trim(), resourceType: input.resourceType, query: input.query ?? '' },
    })
  }
  async updateSavedSearch(id: string, input: Record<string, any>) {
    if (!(await this.prisma.savedSearch.findUnique({ where: { id } }))) throw new Error('Saved search not found')
    const data: Record<string, unknown> = {}
    for (const key of ['name', 'resourceType', 'query']) if (input[key] !== undefined) data[key] = input[key]
    await this.prisma.savedSearch.update({ where: { id }, data })
    return this.prisma.savedSearch.findUnique({ where: { id } })
  }
  async deleteSavedSearch(id: string): Promise<string[]> {
    await this.prisma.savedSearch.delete({ where: { id } })
    return [id]
  }

  async duplicateTheme(id: string) {
    const theme = await this.prisma.themeLibraryEntry.findUnique({ where: { id } })
    if (!theme) throw new Error('Theme not found')
    return this.prisma.themeLibraryEntry.create({
      data: { id: uid('th'), name: `${theme.name} copy`, version: theme.version, role: 'library', imageSrc: theme.imageSrc, addedAt: new Date() },
    })
  }

  async resetDemoData() {
    await reseed(this.prisma)
    return this.settingsSingleton()
  }

  // bootstrap snapshot
  async snapshot(): Promise<any> {
    await ensurePayouts(this.prisma)
    const [products, customersRaw, orders, abandonedCheckouts, collections, locations, inventoryLevels, inventoryHistory, discounts, campaigns, staff, pages, blogPosts, files, menus, apps, notifications, tasks, theme, themeLibrary, companies, segments, transfers, giftCards, payouts, balanceTransactions, metafieldDefinitions, metafields, redirects, locales, markets, activity, returns, orderEdits, planRow, settings, themeSingleton, metaobjectDefinitionRows, metaobjectEntryRows, savedSearchRows, priceListRows] =
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
        this.metaobjectDefinitions(),
        this.metaobjectEntries(),
        this.savedSearches(),
        this.prisma.priceList.findMany({ include: { entries: true }, orderBy: { createdAt: 'desc' } }),
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
    const decoratedOrders = this.ordersService
      ? await this.ordersService.decorateOrders(orders as Record<string, unknown>[])
      : (orders as Record<string, unknown>[]).map((o) => mapOrder(o))
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
      metaobjectDefinitions: metaobjectDefinitionRows,
      metaobjectEntries: metaobjectEntryRows,
      savedSearches: savedSearchRows,
      priceLists: priceListRows.map((pl) => ({ ...pl, parentCompanyId: pl.companyId, entries: pl.entries.map((e) => ({ id: e.id, variantId: e.variantId, price: e.price })) })),
      settings,
      themeLibraryAll: themeLibrary,
    }
  }

  // helpers reused by snapshot
  async orders(): Promise<any[]> {
    const rows = (await this.prisma.order.findMany({ orderBy: { createdAt: 'desc' } })) as unknown as Record<string, unknown>[]
    return this.ordersService ? this.ordersService.decorateOrders(rows) : rows.map((o) => mapOrder(o))
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
  private async loadProductNode(rawId: string): Promise<Record<string, unknown> | null> {
    const p = await this.prisma.product.findUnique({ where: { id: rawId } })
    if (!p) return null
    const mapped = mapProduct(p as unknown as Record<string, unknown>)
    const variants = parseJson<{ id: string }[]>(p.variants as string, [])
    const variantIds = variants.map((v) => v.id)
    const levels = await this.prisma.inventoryLevel.findMany({
      where: { variantId: { in: variantIds } },
    })
    const levelMap = new Map<string, number>()
    for (const l of levels) levelMap.set(l.variantId, (levelMap.get(l.variantId) ?? 0) + l.available)
    mapped.totalInventory = p.trackQuantity
      ? variants.reduce((s, v) => s + (levelMap.get(v.id) ?? 0), 0)
      : 0
    return { ...mapped, __typename: 'Product' }
  }

  private async loadCustomerNode(rawId: string): Promise<Record<string, unknown> | null> {
    const c = await this.prisma.customer.findUnique({ where: { id: rawId } })
    if (!c) return null
    const orders = await this.prisma.order.findMany({
      where: { customerId: rawId, isDraft: false },
      select: { total: true, status: true, paymentStatus: true, createdAt: true, refunds: true },
    })
    const validOrders = orders.filter((o) => o.status !== 'cancelled')
    const totalSpent = roundMoney(
      validOrders.reduce((s, o) => {
        const refunds = parseJson<{ amount?: number }[]>(o.refunds as string, [])
        const refundedAmount = refunds.reduce((rs, r) => rs + (r.amount ?? 0), 0)
        return s + Math.max(0, o.total - refundedAmount)
      }, 0),
    )
    const last = validOrders.sort((a, b) => b.createdAt.toISOString().localeCompare(a.createdAt.toISOString()))[0]
    return {
      ...mapCustomer(c as unknown as Record<string, unknown>, {
        ordersCount: validOrders.length,
        totalSpent,
        lastOrderAt: last?.createdAt ?? null,
      }),
      __typename: 'Customer',
    }
  }

  private async loadSegmentNode(rawId: string): Promise<Record<string, unknown> | null> {
    const s = await this.prisma.segment.findUnique({ where: { id: rawId } })
    if (!s) return null
    const allCustomers = await this.prisma.customer.findMany()
    const filters = parseJson<{ column: string; relation: string; value: string }[]>(s.filters as string, [])
    const allOrders = await this.prisma.order.findMany({ where: { isDraft: false } })

    const statsMap = new Map<string, { ordersCount: number; totalSpent: number }>()
    for (const cust of allCustomers) {
      const custOrders = allOrders.filter((o) => o.customerId === cust.id && o.status !== 'cancelled')
      const totalSpent = roundMoney(
        custOrders.reduce((sum, o) => {
          const refunds = parseJson<{ amount?: number }[]>(o.refunds as string, [])
          const refundedAmount = refunds.reduce((rs, r) => rs + (r.amount ?? 0), 0)
          return sum + Math.max(0, o.total - refundedAmount)
        }, 0),
      )
      statsMap.set(cust.id, { ordersCount: custOrders.length, totalSpent })
    }

    const matched = allCustomers.filter((cust) => {
      const stats = statsMap.get(cust.id) ?? { ordersCount: 0, totalSpent: 0 }
      return filters.every((f) => {
        const val = f.value.trim().toLowerCase()
        if (f.column === 'tag') {
          const tags = parseJson<string[]>(cust.tags as string, []).map((t) => t.toLowerCase())
          if (f.relation === 'equals') return tags.includes(val)
          if (f.relation === 'contains') return tags.some((t) => t.includes(val))
          return false
        }
        const actual =
          f.column === 'orders_count' ? stats.ordersCount
          : f.column === 'total_spent' ? stats.totalSpent
          : f.column === 'email_state' ? cust.emailMarketingConsent
          : f.column === 'city' ? (parseJson<{ city?: string }>(cust.defaultAddress as string, {})?.city ?? '')
          : (parseJson<{ country?: string }>(cust.defaultAddress as string, {})?.country ?? '')
        const numeric = Number(val)
        switch (f.relation) {
          case 'gt': return !Number.isNaN(numeric) && Number(actual) > numeric
          case 'lt': return !Number.isNaN(numeric) && Number(actual) < numeric
          case 'equals': return String(actual).toLowerCase() === val
          case 'contains': return String(actual).toLowerCase().includes(val)
          default: return false
        }
      })
    })
    return { ...mapSegment(s as unknown as Record<string, unknown>, matched.length), __typename: 'Segment' }
  }

  async node(id: string): Promise<Record<string, unknown> | null> {
    if (!id) return null
    const gidMatch = id.match(/^gid:\/\/shopify\/([A-Za-z]+)\/(.+)$/)
    const explicitType = gidMatch ? gidMatch[1].toLowerCase() : null
    const rawId = gidMatch ? gidMatch[2] : id
    const isTypedGid = Boolean(explicitType)

    let inferredType = explicitType
    if (!inferredType) {
      if (rawId.startsWith('p_')) inferredType = 'product'
      else if (rawId.startsWith('col_')) inferredType = 'collection'
      else if (rawId.startsWith('o_')) inferredType = 'order'
      else if (rawId.startsWith('c_')) inferredType = 'customer'
      else if (rawId.startsWith('company_')) inferredType = 'company'
      else if (rawId.startsWith('seg_')) inferredType = 'segment'
      else if (rawId.startsWith('loc_')) inferredType = 'location'
      else if (rawId.startsWith('tf_')) inferredType = 'transfer'
      else if (rawId.startsWith('disc_')) inferredType = 'discount'
      else if (rawId.startsWith('camp_')) inferredType = 'campaign'
      else if (rawId.startsWith('gc_')) inferredType = 'giftcard'
      else if (rawId.startsWith('page_')) inferredType = 'storepage'
      else if (rawId.startsWith('post_')) inferredType = 'blogpost'
      else if (rawId.startsWith('file_')) inferredType = 'fileasset'
      else if (rawId.startsWith('menu_')) inferredType = 'navmenu'
      else if (rawId.startsWith('red_')) inferredType = 'urlredirect'
      else if (rawId.startsWith('mod_e_')) inferredType = 'metaobjectentry'
      else if (rawId.startsWith('mod_')) inferredType = 'metaobjectdefinition'
      else if (rawId.startsWith('mfdef_')) inferredType = 'metafielddefinition'
      else if (rawId.startsWith('mf_')) inferredType = 'metafield'
      else if (rawId.startsWith('staff_')) inferredType = 'staffmember'
      else if (rawId.startsWith('var_')) inferredType = 'productvariant'
    }

    if (inferredType === 'productvariant' || inferredType === 'variant') {
      const p = await this.prisma.product.findFirst({
        where: { variants: { array_contains: [{ id: rawId }] } },
      })
      if (p) {
        const vars = parseJson<Record<string, unknown>[]>(p.variants as string, [])
        const v = vars.find((x) => x.id === rawId)
        if (v) return { ...v, __typename: 'ProductVariant' }
      }
      return null
    }

    if (inferredType === 'product') {
      return this.loadProductNode(rawId)
    }
    if (inferredType === 'order') {
      const o = await this.prisma.order.findUnique({ where: { id: rawId } })
      if (!o) return null
      const risk = await this.prisma.orderRisk.findUnique({ where: { orderId: rawId } })
      return { ...mapOrder(o as unknown as Record<string, unknown>, mapOrderRisk(risk as unknown as Record<string, unknown>)), __typename: 'Order' }
    }
    if (inferredType === 'customer') {
      return this.loadCustomerNode(rawId)
    }
    if (inferredType === 'collection') {
      const c = await this.prisma.collection.findUnique({ where: { id: rawId } })
      return c ? { ...mapCollection(c as unknown as Record<string, unknown>), __typename: 'Collection' } : null
    }
    if (inferredType === 'company') {
      const c = await this.prisma.company.findUnique({ where: { id: rawId } })
      return c ? { ...mapCompany(c as unknown as Record<string, unknown>), __typename: 'Company' } : null
    }
    if (inferredType === 'segment') {
      return this.loadSegmentNode(rawId)
    }
    if (inferredType === 'location') {
      const l = await this.prisma.location.findUnique({ where: { id: rawId } })
      return l ? { ...l, __typename: 'Location' } : null
    }
    if (inferredType === 'transfer') {
      const t = await this.prisma.transfer.findUnique({ where: { id: rawId } })
      return t ? { ...mapTransfer(t as unknown as Record<string, unknown>), __typename: 'Transfer' } : null
    }
    if (inferredType === 'discount') {
      const d = await this.prisma.discount.findUnique({ where: { id: rawId } })
      return d ? { ...mapDiscount(d as unknown as Record<string, unknown>), __typename: 'Discount' } : null
    }
    if (inferredType === 'campaign') {
      const c = await this.prisma.campaign.findUnique({ where: { id: rawId } })
      return c ? { ...c, __typename: 'Campaign' } : null
    }
    if (inferredType === 'giftcard') {
      const g = await this.prisma.giftCard.findUnique({ where: { id: rawId } })
      return g ? { ...mapGiftCard(g as unknown as Record<string, unknown>), __typename: 'GiftCard' } : null
    }
    if (inferredType === 'storepage' || inferredType === 'page') {
      const sp = await this.prisma.storePage.findUnique({ where: { id: rawId } })
      return sp ? { ...sp, __typename: 'StorePage' } : null
    }
    if (inferredType === 'blogpost' || inferredType === 'article') {
      const bp = await this.prisma.blogPost.findUnique({ where: { id: rawId } })
      return bp ? { ...bp, tags: parseJson(bp.tags as string, []), __typename: 'BlogPost' } : null
    }
    if (inferredType === 'fileasset' || inferredType === 'file') {
      const fa = await this.prisma.fileAsset.findUnique({ where: { id: rawId } })
      return fa ? { ...mapFile(fa as unknown as Record<string, unknown>), __typename: 'FileAsset' } : null
    }
    if (inferredType === 'navmenu' || inferredType === 'menu') {
      let nm = await this.prisma.navMenu.findUnique({ where: { id: rawId } })
      if (!nm) nm = await this.prisma.navMenu.findUnique({ where: { handle: rawId } })
      return nm ? { ...mapMenu(nm as unknown as Record<string, unknown>), __typename: 'NavMenu' } : null
    }
    if (inferredType === 'urlredirect' || inferredType === 'redirect') {
      const ur = await this.prisma.redirect.findUnique({ where: { id: rawId } })
      return ur ? { ...ur, __typename: 'UrlRedirect' } : null
    }
    if (inferredType === 'metaobjectdefinition') {
      const mod = await this.prisma.metaobjectDefinition.findUnique({ where: { id: rawId } })
      return mod ? { ...mapMetaobjectDefinition(mod as unknown as Record<string, unknown>), __typename: 'MetaobjectDefinition' } : null
    }
    if (inferredType === 'metaobjectentry') {
      const moe = await this.prisma.metaobjectEntry.findUnique({ where: { id: rawId } })
      return moe ? { ...mapMetaobjectEntry(moe as unknown as Record<string, unknown>), __typename: 'MetaobjectEntry' } : null
    }
    if (inferredType === 'metafielddefinition') {
      const mfd = await this.prisma.metafieldDefinition.findUnique({ where: { id: rawId } })
      return mfd ? { ...mfd, __typename: 'MetafieldDefinition' } : null
    }
    if (inferredType === 'metafield') {
      const mf = await this.prisma.metafield.findUnique({ where: { id: rawId } })
      return mf ? { ...mf, __typename: 'Metafield' } : null
    }
    if (inferredType === 'staffmember' || inferredType === 'staff') {
      const sm = await this.prisma.staffMember.findUnique({ where: { id: rawId } })
      return sm ? { ...mapStaff(sm as unknown as Record<string, unknown>), __typename: 'StaffMember' } : null
    }

    // If type was explicitly given (typed GID) or inferred from prefix and not found, never fallback
    if (isTypedGid || inferredType) {
      return null
    }

    // Fallback search only for untyped, prefix-less raw IDs
    const p = await this.loadProductNode(rawId)
    if (p) return p

    const o = await this.prisma.order.findUnique({ where: { id: rawId } })
    if (o) {
      const risk = await this.prisma.orderRisk.findUnique({ where: { orderId: rawId } })
      return { ...mapOrder(o as unknown as Record<string, unknown>, mapOrderRisk(risk as unknown as Record<string, unknown>)), __typename: 'Order' }
    }

    const c = await this.loadCustomerNode(rawId)
    if (c) return c

    const col = await this.prisma.collection.findUnique({ where: { id: rawId } })
    if (col) return { ...mapCollection(col as unknown as Record<string, unknown>), __typename: 'Collection' }
    return null
  }

  async nodes(ids: string[]): Promise<(Record<string, unknown> | null)[]> {
    if (ids.length > 50) {
      throw new Error('nodes query supports up to 50 ids per request')
    }
    return Promise.all(ids.map((id) => this.node(id)))
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
  node(@Args('id') id: string) {
    return this.service.node(id)
  }

  @Query()
  nodes(@Args('ids', { type: () => [String] }) ids: string[]) {
    return this.service.nodes(ids)
  }


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
  currentStaffMember() {
    return this.service.currentStaffMember()
  }
  @Query()
  shopPolicies() {
    return this.service.shopPolicies()
  }
  @Query()
  domains() {
    return this.service.domains()
  }
  @Query()
  savedSearches(@Args('resourceType', { nullable: true }) resourceType?: string) {
    return this.service.savedSearches(resourceType)
  }
  @Query()
  pagesCount() {
    return this.service.pagesCount()
  }
  @Query()
  blogPostsCount() {
    return this.service.blogPostsCount()
  }
  @Query()
  redirectsCount() {
    return this.service.redirectsCount()
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
  async metaobjectDefinitionCreate(@Args('definition') definition: Record<string, any>) {
    try {
      return { definition: await this.service.metaobjectDefinitionCreate(definition), userErrors: [] }
    } catch (e) {
      return { definition: null, userErrors: [{ field: ['definition'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async metaobjectDefinitionUpdate(@Args('id') id: string, @Args('definition') definition: Record<string, any>) {
    try {
      return { definition: await this.service.metaobjectDefinitionUpdate(id, definition), userErrors: [] }
    } catch (e) {
      return { definition: null, userErrors: [{ field: ['definition'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async metaobjectDefinitionDelete(@Args('id') id: string) {
    try {
      return { updatedIds: await this.service.metaobjectDefinitionDelete(id), userErrors: [] }
    } catch (e) {
      return { updatedIds: [], userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
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
  async metafieldDefinitionUpdate(@Args('id') id: string, @Args('definition') definition: Record<string, any>) {
    try {
      return { definition: await this.service.metafieldDefinitionUpdate(id, definition), userErrors: [] }
    } catch (e) {
      return { definition: null, userErrors: [{ field: ['definition'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async metafieldsDelete(@Args('ids') ids: string[]) {
    try {
      return { updatedIds: await this.service.metafieldsDelete(ids), userErrors: [] }
    } catch (e) {
      return { updatedIds: [], userErrors: [{ field: ['ids'], message: (e as Error).message }] }
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
  marketCreate(@Args('code') code: string, @Args('name', { nullable: true }) name?: string, @Args('currency', { nullable: true }) currency?: string) {
    return this.service.marketCreate(code, name, currency)
  }
  @Mutation()
  async marketDelete(@Args('code') code: string) {
    try {
      return { updatedIds: await this.service.marketDelete(code), userErrors: [] }
    } catch (e) {
      return { updatedIds: [], userErrors: [{ field: ['code'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  shopPolicyUpdate(@Args('policy') policy: string, @Args('body') body: string) {
    return this.service.shopPolicyUpdate(policy, body)
  }
  @Mutation()
  domainAdd(@Args('host') host: string) {
    return this.service.domainAdd(host)
  }
  @Mutation()
  domainSetPrimary(@Args('host') host: string) {
    return this.service.domainSetPrimary(host)
  }
  @Mutation()
  domainDelete(@Args('host') host: string) {
    return this.service.domainDelete(host)
  }
  @Mutation()
  async savedSearchCreate(@Args('search') search: Record<string, any>) {
    try {
      return { savedSearch: await this.service.createSavedSearch(search), userErrors: [] }
    } catch (e) {
      return { savedSearch: null, userErrors: [{ field: ['search'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async savedSearchUpdate(@Args('id') id: string, @Args('search') search: Record<string, any>) {
    try {
      return { savedSearch: await this.service.updateSavedSearch(id, search), userErrors: [] }
    } catch (e) {
      return { savedSearch: null, userErrors: [{ field: ['search'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async savedSearchDelete(@Args('id') id: string) {
    try {
      return { updatedIds: await this.service.deleteSavedSearch(id), userErrors: [] }
    } catch (e) {
      return { updatedIds: [], userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  themeDuplicate(@Args('id') id: string) {
    return this.service.duplicateTheme(id)
  }
  @Mutation()
  localeUpdate(@Args('code') code: string, @Args('name') name: string) {
    return this.service.localeUpdate(code, name)
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
    return this.service.resetDemoData()
  }
}

@Resolver('Node')
export class NodeResolver {
  @ResolveField()
  __resolveType(value: { __typename?: string } | null | undefined): string | null {
    return value?.__typename ?? null
  }
}

@Module({
  imports: [PrismaModule, AuthModule, OrdersModule],
  providers: [StoreContentResolver, StoreContentService, NodeResolver],
})
export class StoreContentModule {}
