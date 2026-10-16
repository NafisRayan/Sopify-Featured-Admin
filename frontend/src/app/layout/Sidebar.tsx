import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  House, Package, Tag, Users, FileText, Megaphone, TicketPercent, ChartNoAxesCombined,
  Globe, LayoutGrid, Settings, ChevronDown, ChevronRight, Store, BriefcaseBusiness, Check, Plus,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/uiStore'
import { initials } from '@/lib/format'
import { Popover } from '@/components/ui'
import { cn } from '@/lib/cn'
import { gqlRequest, getActiveStoreId, setActiveStoreId } from '@/services/api'
import { StoreCreateModal } from '@/features/settings/StoreCreateModal'

interface NavChild {
  label: string
  to: string
  end?: boolean
}
interface NavEntry {
  label: string
  to?: string
  icon: typeof House
  badge?: number
  children?: NavChild[]
}

export function Sidebar() {
  const location = useLocation()
  const settings = useStore((s) => s.settings)
  const openOrders = useStore((s) =>
    s.orders.filter((o) => !o.isDraft && o.status === 'open').length,
  )
  const drafts = useStore((s) => s.orders.filter((o) => o.isDraft).length)
  const mobileOpen = useUiStore((s) => s.mobileNavOpen)
  const setMobileOpen = useUiStore((s) => s.setMobileNavOpen)

  const [activeStoreId, setActiveId] = useState(() => getActiveStoreId())
  const [stores, setStores] = useState<Array<{ id: string; name: string; slug: string; currency: string }>>([
    { id: 'store_northstar', name: 'Northstar Goods', slug: 'northstar', currency: 'USD' },
  ])
  const [createModalOpen, setCreateModalOpen] = useState(false)

  useEffect(() => {
    gqlRequest<{ stores: Array<{ id: string; name: string; slug: string; currency: string }> }>(`
      query GetStores {
        stores {
          id
          name
          slug
          currency
        }
      }
    `)
      .then((res) => {
        if (res?.stores?.length) {
          setStores(res.stores)
        }
      })
      .catch(() => {
        // ignore if offline
      })
  }, [createModalOpen])

  const currentStore = stores.find((s) => s.id === activeStoreId) || stores[0]
  // auto-expand the group that contains the active route
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    Orders: true,
    Products: true,
  }))

  const nav: NavEntry[] = [
    { label: 'Home', to: '/', icon: House },
    {
      label: 'Orders', to: '/orders', icon: Package, badge: openOrders,
      children: [
        { label: 'All orders', to: '/orders' },
        { label: 'Drafts', to: '/draft-orders' },
        { label: 'Abandoned checkouts', to: '/abandoned-checkouts' },
      ],
    },
    {
      label: 'Products', to: '/products', icon: Tag,
      children: [
        { label: 'All products', to: '/products' },
        { label: 'Reviews', to: '/reviews' },
        { label: 'Collections', to: '/collections' },
        { label: 'Inventory', to: '/inventory' },
        { label: 'Transfers', to: '/inventory/transfers' },
        { label: 'Gift cards', to: '/gift-cards' },
        { label: 'Locations', to: '/locations' },
      ],
    },
    {
      label: 'Customers', to: '/customers', icon: Users,
      children: [
        { label: 'All customers', to: '/customers' },
        { label: 'Segments', to: '/customers/segments' },
        { label: 'Companies (B2B)', to: '/companies' },
      ],
    },
    {
      label: 'Content', to: '/content/pages', icon: FileText,
      children: [
        { label: 'Pages', to: '/content/pages' },
        { label: 'Blog posts', to: '/content/blog' },
        { label: 'Content entries', to: '/content/entries' },
        { label: 'Files', to: '/files' },
      ],
    },
    { label: 'Marketing', to: '/marketing', icon: Megaphone },
    { label: 'Discounts', to: '/discounts', icon: TicketPercent },
    { label: 'Analytics', to: '/analytics', icon: ChartNoAxesCombined },
    { label: 'Finances', to: '/finances/payouts', icon: BriefcaseBusiness },
    {
      label: 'Online Store', to: '/online-store', icon: Globe,
      children: [
        { label: 'Themes', to: '/online-store' },
        { label: 'Navigation', to: '/online-store/navigation' },
        { label: 'URL redirects', to: '/online-store/redirects' },
        { label: 'Preferences', to: '/online-store/preferences' },
      ],
    },
    { label: 'Apps', to: '/apps', icon: LayoutGrid },
  ]

  const isGroupActive = (entry: NavEntry) =>
    entry.children?.some((c) => location.pathname.startsWith(c.to)) ||
    (entry.to ? location.pathname.startsWith(entry.to) : false)

  const closeMobile = () => setMobileOpen(false)

  return (
    <>
      {/* scrim for mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={closeMobile} aria-hidden />
      )}
      <nav
        aria-label="Main navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-surface-dark text-text-on-dark transition-transform duration-200 md:static md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Store switcher */}
        {/* Store switcher */}
        <div className="p-2">
          <Popover
            align="left"
            panelClassName="w-64"
            trigger={
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-surface-dark-hover">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10">
                  <Store size={16} className="text-text-on-dark" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-white">
                    {currentStore?.name || settings.storeName}
                  </span>
                  <span className="block text-[11px] text-text-on-dark-muted font-mono truncate">
                    {currentStore?.slug || 'northstar'}.platform.com
                  </span>
                </span>
                <ChevronDown size={14} className="text-text-on-dark-muted" />
              </button>
            }
          >
            {(close) => (
              <div>
                <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-text-subdued">
                  Merchant Stores
                </p>
                <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5">
                  {stores.map((s) => {
                    const isActive = s.id === currentStore.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition ${
                          isActive ? 'bg-surface-hover font-semibold' : 'hover:bg-surface-hover'
                        }`}
                        onClick={() => {
                          setActiveStoreId(s.id)
                          setActiveId(s.id)
                          close()
                          window.location.reload()
                        }}
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded bg-[#f1f1f1] text-neutral-800 shrink-0">
                          <Store size={14} />
                        </span>
                        <div className="min-w-0 flex-1 truncate">
                          <span className="block truncate text-[13px] text-text">{s.name}</span>
                          <span className="block text-[11px] text-text-muted truncate">{s.slug}.platform.com</span>
                        </div>
                        {isActive && <Check size={14} className="text-success shrink-0" />}
                      </button>
                    )
                  })}
                </div>

                <button
                  type="button"
                  className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-lg border border-[#d0d0d0] px-2 py-2 text-[12px] font-semibold text-text hover:bg-surface-hover transition"
                  onClick={() => {
                    close()
                    setCreateModalOpen(true)
                  }}
                >
                  <Plus size={13} /> Create new store
                </button>
              </div>
            )}
          </Popover>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 scroll-thin">
          {nav.map((entry) => {
            const Icon = entry.icon
            const groupActive = isGroupActive(entry)
            const expandedOpen = expanded[entry.label] ?? false
            if (entry.children) {
              return (
                <div key={entry.label} className="mb-0.5">
                  <button
                    onClick={() => setExpanded((m) => ({ ...m, [entry.label]: !expandedOpen }))}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-medium hover:bg-surface-dark-hover',
                      groupActive ? 'text-white' : 'text-text-on-dark',
                    )}
                    aria-expanded={expandedOpen}
                  >
                    <Icon size={17} strokeWidth={1.8} />
                    <span className="flex-1 text-left">{entry.label}</span>
                    {entry.badge ? (
                      <span className="rounded-full bg-white/15 px-1.5 text-[11px] text-white">{entry.badge}</span>
                    ) : null}
                    {expandedOpen ? <ChevronDown size={13} className="opacity-60" /> : <ChevronRight size={13} className="opacity-60" />}
                  </button>
                  {expandedOpen && (
                    <div className="ml-[22px] mt-0.5 space-y-0.5 border-l border-white/10 pl-2.5">
                      {entry.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          end={child.end}
                          onClick={closeMobile}
                          className={({ isActive }) =>
                            cn(
                              'block rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-dark-hover',
                              isActive ? 'bg-surface-dark-hover font-medium text-white' : 'text-text-on-dark-muted',
                            )
                          }
                        >
                          {child.label}
                          {child.to === '/draft-orders' && drafts > 0 && (
                            <span className="ml-1.5 rounded bg-white/15 px-1 text-[10px] text-white">{drafts}</span>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            }
            return (
              <NavLink
                key={entry.label}
                to={entry.to!}
                end={entry.to === '/'}
                onClick={closeMobile}
                className={({ isActive }) =>
                  cn(
                    'mb-0.5 flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-medium hover:bg-surface-dark-hover',
                    isActive ? 'bg-surface-dark-hover text-white' : 'text-text-on-dark',
                  )
                }
              >
                <Icon size={17} strokeWidth={1.8} />
                <span className="flex-1">{entry.label}</span>
                {entry.badge ? (
                  <span className="rounded-full bg-white/15 px-1.5 text-[11px] text-white">{entry.badge}</span>
                ) : null}
              </NavLink>
            )
          })}
        </div>

        {/* Settings pinned at the bottom */}
        <div className="border-t border-white/10 p-2">
          <NavLink
            to="/settings"
            onClick={closeMobile}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-medium hover:bg-surface-dark-hover',
                isActive || location.pathname.startsWith('/settings')
                  ? 'bg-surface-dark-hover text-white'
                  : 'text-text-on-dark',
              )
            }
          >
            <Settings size={17} strokeWidth={1.8} />
            Settings
          </NavLink>
          <div className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4a5568] text-[11px] font-semibold text-white">
              {initials('Ava Chen')}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white">Ava Chen</p>
              <p className="truncate text-[11px] text-text-on-dark-muted">ava@northstargoods.com</p>
            </div>
          </div>
        </div>
      </nav>
      <StoreCreateModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(newStore) => {
          setStores((prev) => [...prev, { ...newStore, currency: 'USD' }])
          setActiveStoreId(newStore.id)
          setActiveId(newStore.id)
          window.location.reload()
        }}
      />
    </>
  )
}
