// Typed access to the generated seed data. The store hydrates from these on
// first launch; afterwards localStorage is the source of truth (spec §38).
import productsJson from './products.json'
import customersJson from './customers.json'
import ordersJson from './orders.json'
import abandonedJson from './abandoned-checkouts.json'
import collectionsJson from './collections.json'
import locationsJson from './locations.json'
import inventoryLevelsJson from './inventory-levels.json'
import inventoryHistoryJson from './inventory-history.json'
import discountsJson from './discounts.json'
import campaignsJson from './campaigns.json'
import staffJson from './staff.json'
import pagesJson from './pages.json'
import postsJson from './posts.json'
import filesJson from './files.json'
import menusJson from './menus.json'
import appsJson from './apps.json'
import appSuggestionsJson from './app-suggestions.json'
import settingsJson from './settings.json'
import notificationsJson from './notifications.json'
import tasksJson from './tasks.json'
import themeJson from './theme.json'
import themeLibraryJson from './theme-library.json'
import companiesJson from './companies.json'
import segmentsJson from './segments.json'
import transfersJson from './transfers.json'
import giftCardsJson from './gift-cards.json'
import payoutsJson from './payouts.json'
import balanceTransactionsJson from './balance-transactions.json'
import metafieldDefinitionsJson from './metafield-definitions.json'
import metafieldsJson from './metafields.json'
import redirectsJson from './redirects.json'
import localesJson from './locales.json'
import marketsJson from './markets.json'
import staffActivityJson from './staff-activity.json'
import returnsJson from './returns.json'
import orderEditsJson from './order-edits.json'
import orderRiskJson from './order-risk.json'
import planJson from './plan.json'
import metaobjectDefinitionsJson from './metaobject-definitions.json'
import metaobjectEntriesJson from './metaobject-entries.json'
import priceListsJson from './price-lists.json'
import savedSearchesJson from './saved-searches.json'
import type {
  Product, Customer, Order, AbandonedCheckout, Collection, Location, InventoryLevel,
  InventoryHistoryEntry, Discount, Campaign, StaffMember, StorePage, BlogPost, FileAsset,
  NavMenu, AppEntry, StoreSettings, AdminNotification, TaskItem, ThemeSettings,
  PriceList, SavedSearch,
} from '@/types'
import type {
  Company, CustomerSegment, InventoryTransfer, GiftCard, Payout, BalanceTransaction,
  MetafieldDefinition, MetafieldOwnerMap, UrlRedirect, StoreLocale, MarketCountry,
  StaffActivityEntry, ReturnRecord, OrderEditRecord, OrderRisk, StorePlan,
  MetaobjectDefinition, MetaobjectEntry,
} from '@/types/parity'

export const seedProducts = productsJson as Product[]
export const seedCustomers = customersJson as Customer[]
export const seedOrders = ordersJson as Order[]
export const seedAbandoned = abandonedJson as AbandonedCheckout[]
export const seedCollections = collectionsJson as Collection[]
export const seedLocations = locationsJson as Location[]
export const seedInventoryLevels = inventoryLevelsJson as InventoryLevel[]
export const seedInventoryHistory = inventoryHistoryJson as InventoryHistoryEntry[]
export const seedDiscounts = discountsJson as Discount[]
export const seedCampaigns = campaignsJson as Campaign[]
export const seedStaff = staffJson as StaffMember[]
export const seedPages = pagesJson as StorePage[]
export const seedPosts = postsJson as BlogPost[]
export const seedFiles = filesJson as FileAsset[]
export const seedMenus = menusJson as NavMenu[]
export const seedApps = appsJson as AppEntry[]
export const seedAppSuggestions = appSuggestionsJson as AppEntry[]
export const seedSettings = settingsJson as StoreSettings
export const seedNotifications = notificationsJson as AdminNotification[]
export const seedTasks = tasksJson as TaskItem[]
export const seedTheme = themeJson as ThemeSettings

export interface ThemeLibraryEntry {
  id: string
  name: string
  version: string
  role: string
  imageSrc: string
  addedAt: string
}
export const seedThemeLibrary = themeLibraryJson as ThemeLibraryEntry[]

// parity expansion
export const seedCompanies = companiesJson as Company[]
export const seedSegments = segmentsJson as CustomerSegment[]
export const seedTransfers = transfersJson as InventoryTransfer[]
export const seedGiftCards = giftCardsJson as GiftCard[]
export const seedPayouts = payoutsJson as Payout[]
export const seedBalanceTransactions = balanceTransactionsJson as BalanceTransaction[]
export const seedMetafieldDefinitions = metafieldDefinitionsJson as MetafieldDefinition[]
export const seedMetafields = metafieldsJson as MetafieldOwnerMap
export const seedRedirects = redirectsJson as UrlRedirect[]
export const seedLocales = localesJson as StoreLocale[]
export const seedMarkets = marketsJson as MarketCountry[]
export const seedStaffActivity = staffActivityJson as StaffActivityEntry[]
export const seedReturns = returnsJson as ReturnRecord[]
export const seedOrderEdits = orderEditsJson as OrderEditRecord[]
export const seedOrderRisk = orderRiskJson as Record<string, OrderRisk>
export const seedPlan = planJson as StorePlan

export const seedMetaobjectDefinitions = metaobjectDefinitionsJson as MetaobjectDefinition[]
export const seedMetaobjectEntries = metaobjectEntriesJson as unknown as MetaobjectEntry[]
export const seedPriceLists = priceListsJson as unknown as PriceList[]
export const seedSavedSearches = savedSearchesJson as unknown as SavedSearch[]
