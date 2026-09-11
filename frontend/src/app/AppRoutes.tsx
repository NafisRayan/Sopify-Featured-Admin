import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Sidebar } from './layout/Sidebar'
import { HeaderBar } from './layout/HeaderBar'
import { GlobalSearch } from './layout/GlobalSearch'
import { SkeletonRows } from '@/components/ui'

// ── lazy feature pages ──────────────────────────────────────────────────────
const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'))
const OrdersList = lazy(() => import('@/features/orders/OrdersListPage'))
const OrderCreate = lazy(() => import('@/features/orders/OrderCreatePage'))
const OrderPrint = lazy(() => import('@/features/orders/OrderPrintPage'))
const OrderDetail = lazy(() => import('@/features/orders/OrderDetailPage'))
const DraftOrders = lazy(() => import('@/features/orders/DraftOrdersPage'))
const AbandonedCheckouts = lazy(() => import('@/features/orders/AbandonedCheckoutsPage'))
const ProductsList = lazy(() => import('@/features/products/ProductsListPage'))
const ProductNew = lazy(() => import('@/features/products/ProductNewPage'))
const ProductDetail = lazy(() => import('@/features/products/ProductDetailPage'))
const ProductEditor = lazy(() => import('@/features/products/ProductEditorPage'))
const CollectionsList = lazy(() => import('@/features/collections/CollectionsListPage'))
const CollectionDetail = lazy(() => import('@/features/collections/CollectionDetailPage'))
const InventoryList = lazy(() => import('@/features/inventory/InventoryPage'))
const LocationsList = lazy(() => import('@/features/inventory/LocationsPage'))
const CustomersList = lazy(() => import('@/features/customers/CustomersListPage'))
const CustomerDetail = lazy(() => import('@/features/customers/CustomerDetailPage'))
const DiscountsList = lazy(() => import('@/features/discounts/DiscountsListPage'))
const DiscountDetail = lazy(() => import('@/features/discounts/DiscountDetailPage'))
const AnalyticsPage = lazy(() => import('@/features/analytics/AnalyticsPage'))
const MarketingPage = lazy(() => import('@/features/marketing/MarketingPage'))
const PagesList = lazy(() => import('@/features/content/PagesListPage'))
const PageDetail = lazy(() => import('@/features/content/PageDetailPage'))
const BlogList = lazy(() => import('@/features/content/BlogListPage'))
const BlogDetail = lazy(() => import('@/features/content/BlogDetailPage'))
const FilesPage = lazy(() => import('@/features/content/FilesPage'))
const EntriesList = lazy(() => import('@/features/content/EntriesListPage'))
const OnlineStorePage = lazy(() => import('@/features/online-store/OnlineStorePage'))
const NavigationPage = lazy(() => import('@/features/online-store/NavigationPage'))
const PreferencesPage = lazy(() => import('@/features/online-store/PreferencesPage'))
const AppsPage = lazy(() => import('@/features/apps/AppsPage'))
const SettingsIndex = lazy(() => import('@/features/settings/SettingsIndexPage'))
const SettingsSection = lazy(() => import('@/features/settings/SettingsSectionPage'))
const StaffDetail = lazy(() => import('@/features/settings/StaffDetailPage'))
const CompaniesList = lazy(() => import('@/features/companies/CompaniesListPage'))
const CompanyDetail = lazy(() => import('@/features/companies/CompanyDetailPage'))
const SegmentsList = lazy(() => import('@/features/customers/SegmentsListPage'))
const SegmentDetail = lazy(() => import('@/features/customers/SegmentDetailPage'))
const TransfersList = lazy(() => import('@/features/inventory/TransfersListPage'))
const GiftCardsList = lazy(() => import('@/features/gift-cards/GiftCardsListPage'))
const PayoutsPage = lazy(() => import('@/features/finances/PayoutsPage'))
const RedirectsPage = lazy(() => import('@/features/online-store/RedirectsPage'))
const SearchResults = lazy(() => import('@/features/search/SearchResultsPage'))
const NotFound = lazy(() => import('@/features/misc/NotFoundPage'))

function PageFallback() {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <SkeletonRows rows={6} cols={4} />
    </div>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.getElementById('main-scroll')?.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

export function AppRoutes() {
  const printRoute = useLocation().pathname.match(/^\/orders\/[^/]+\/print$/)
  if (printRoute) {
    return (
      <Suspense fallback={null}>
        <Routes>
          <Route path="/orders/:id/print" element={<OrderPrint />} />
        </Routes>
      </Suspense>
    )
  }
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <div id="main-scroll" className="flex min-w-0 flex-1 flex-col overflow-y-auto scroll-thin">
        <HeaderBar />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-3 py-4 md:px-6">
          <Suspense fallback={<PageFallback />}>
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<Dashboard />} />

              {/* Orders */}
              <Route path="/orders" element={<OrdersList />} />
              <Route path="/orders/new" element={<OrderCreate />} />
              <Route path="/orders/:id" element={<OrderDetail />} />
              <Route path="/draft-orders" element={<DraftOrders />} />
              <Route path="/draft-orders/:id" element={<OrderDetail />} />
              <Route path="/abandoned-checkouts" element={<AbandonedCheckouts />} />

              {/* Products */}
              <Route path="/products" element={<ProductsList />} />
              <Route path="/products/new" element={<ProductNew />} />
              <Route path="/products/:id" element={<ProductDetail />} />
              <Route path="/products/:id/edit" element={<ProductEditor />} />

              {/* Collections */}
              <Route path="/collections" element={<CollectionsList />} />
              <Route path="/collections/:id" element={<CollectionDetail />} />

              {/* Inventory */}
              <Route path="/inventory" element={<InventoryList />} />
              <Route path="/inventory/transfers" element={<TransfersList />} />
              <Route path="/locations" element={<LocationsList />} />

              {/* B2B + finances */}
              <Route path="/companies" element={<CompaniesList />} />
              <Route path="/companies/:id" element={<CompanyDetail />} />
              <Route path="/gift-cards" element={<GiftCardsList />} />
              <Route path="/finances/payouts" element={<PayoutsPage />} />

              {/* Customers */}
              <Route path="/customers" element={<CustomersList />} />
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="/customers/segments" element={<SegmentsList />} />
              <Route path="/customers/segments/:id" element={<SegmentDetail />} />

              {/* Discounts */}
              <Route path="/discounts" element={<DiscountsList />} />
              <Route path="/discounts/:id" element={<DiscountDetail />} />
              <Route path="/discounts/new" element={<DiscountDetail />} />

              {/* Insights */}
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/marketing" element={<MarketingPage />} />

              {/* Content */}
              <Route path="/content/pages" element={<PagesList />} />
              <Route path="/content/pages/:id" element={<PageDetail />} />
              <Route path="/content/blog" element={<BlogList />} />
              <Route path="/content/blog/:id" element={<BlogDetail />} />
              <Route path="/content/blog/new" element={<BlogDetail />} />
              <Route path="/files" element={<FilesPage />} />
              <Route path="/content/entries" element={<EntriesList />} />

              {/* Online store */}
              <Route path="/online-store" element={<OnlineStorePage />} />
              <Route path="/online-store/navigation" element={<NavigationPage />} />
              <Route path="/online-store/navigation/:handle" element={<NavigationPage />} />
              <Route path="/online-store/preferences" element={<PreferencesPage />} />
              <Route path="/online-store/redirects" element={<RedirectsPage />} />

              {/* Apps */}
              <Route path="/apps" element={<AppsPage />} />

              {/* Settings */}
              <Route path="/settings" element={<SettingsIndex />} />
              <Route path="/settings/:section" element={<SettingsSection />} />
              <Route path="/settings/users/:id" element={<StaffDetail />} />

              {/* Search + fallback */}
              <Route path="/search" element={<SearchResults />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <GlobalSearch />
    </div>
  )
}
