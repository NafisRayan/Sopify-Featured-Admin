import { Bell, CircleHelp, Search, Menu as MenuIcon, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/uiStore'
import { formatRelative, initials } from '@/lib/format'
import { Badge, Popover, PortalMenu, useToast, type MenuItemDef } from '@/components/ui'
import { markAllNotificationsRead, markNotificationRead } from '@/services/settingsService'
import { IS_REMOTE, logout } from '@/services/api'
import { cn } from '@/lib/cn'

function Notifications() {
  const notifications = useStore((s) => s.notifications)
  const unread = notifications.filter((n) => !n.read).length
  const navigate = useNavigate()

  return (
    <Popover
      align="right"
      panelClassName="w-80 p-0"
      trigger={
        <button
          className="relative rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        >
          <Bell size={17} />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical-strong px-0.5 text-[10px] font-semibold text-white">
              {unread}
            </span>
          )}
        </button>
      }
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h3 className="text-[13px] font-semibold">Notifications</h3>
            <button
              className="text-xs text-accent hover:underline"
              onClick={() => void markAllNotificationsRead()}
            >
              Mark all read
            </button>
          </div>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto scroll-thin">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  className={cn(
                    'flex w-full gap-2.5 px-3 py-2.5 text-left hover:bg-surface-hover',
                    !n.read && 'bg-accent-surface/40',
                  )}
                  onClick={() => {
                    void markNotificationRead(n.id)
                    if (n.link) navigate(n.link)
                    close()
                  }}
                >
                  <span
                    className={cn(
                      'mt-1 h-2 w-2 shrink-0 rounded-full',
                      n.kind === 'critical' ? 'bg-critical-strong' : n.kind === 'warning' ? 'bg-[#c47f00]' : 'bg-[#196ec2]',
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-text">{n.title}</span>
                    <span className="block text-xs text-text-muted">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-text-subdued">{formatRelative(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Popover>
  )
}

function AccountMenu() {
  const staff = useStore((s) => s.staff)
  const actingStaffId = useUiStore((s) => s.actingStaffId)
  const setActingStaffId = useUiStore((s) => s.setActingStaffId)
  const { toast } = useToast()
  const member = staff.find((s) => s.id === actingStaffId)
  const effective = member ?? staff.find((s) => s.role === 'owner')

  const simulateItems: MenuItemDef[] = [
    { label: actingStaffId === null ? '✓ Owner (Ava Chen)' : 'Owner (Ava Chen)', onClick: () => {
        setActingStaffId(null)
        toast('Now acting as the store owner')
      } },
    ...staff
      .filter((s) => s.role !== 'owner')
      .slice(0, 6)
      .map((s) => ({
        label: `${actingStaffId === s.id ? '✓ ' : ''}${s.name} (${s.role})`,
        onClick: () => {
          setActingStaffId(s.id)
          toast(`Now acting as ${s.name} — permissions apply`)
        },
      })),
  ]

  return (
    <PortalMenu
      align="right"
      items={[
        {
          label: `${effective?.name ?? 'Owner'} · ${effective?.role ?? 'owner'}`,
          disabled: true,
        },
        { label: 'Simulate permissions as…', disabled: true, separatorBefore: true },
        ...simulateItems,
        { label: 'View online store', separatorBefore: true, onClick: () => toast('The storefront is not part of this admin demo', { tone: 'info' }) },
        {
          label: 'Log out',
          destructive: true,
          onClick: () => {
            if (!IS_REMOTE) {
              toast('Logging out is disabled in local demo mode', { tone: 'warning' })
              return
            }
            void logout().then(() => window.location.reload())
          },
        },
      ]}
      trigger={
        <button className="flex items-center gap-1 rounded-lg p-1 pr-1.5 hover:bg-surface-hover" aria-label="Account menu">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4a5568] text-[11px] font-semibold text-white">
            {initials(effective?.name ?? 'Ava Chen')}
          </span>
          <ChevronDown size={12} className="text-text-muted" />
        </button>
      }
    />
  )
}

export function HeaderBar() {
  const setGlobalSearchOpen = useUiStore((s) => s.setGlobalSearchOpen)
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen)

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur md:px-4">
      <button
        className="rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text md:hidden"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation"
      >
        <MenuIcon size={18} />
      </button>

      <button
        onClick={() => setGlobalSearchOpen(true)}
        className="flex h-8 w-full max-w-sm items-center gap-2 rounded-lg border border-[#d0d0d0] bg-[#f5f5f5] px-2.5 text-left text-[13px] text-text-muted hover:border-border-strong hover:bg-surface md:mx-auto"
        aria-label="Open search"
      >
        <Search size={14} />
        <span className="flex-1 truncate">Search</span>
        <kbd className="hidden rounded border border-border bg-surface px-1.5 text-[10px] sm:block">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1 md:ml-0">
        <span className="hidden sm:block">
          <Badge tone="attention" dot>
            Demo data
          </Badge>
        </span>
        <Popover
          align="right"
          panelClassName="w-72"
          trigger={
            <button className="rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text" aria-label="Help">
              <CircleHelp size={17} />
            </button>
          }
        >
          <div className="space-y-1 text-[13px]">
            <p className="font-semibold text-text">Help center</p>
            <p className="pb-1 text-xs text-text-muted">This is a demo admin built on simulated data.</p>
            <ul className="space-y-1 text-text">
              <li>
                <a className="hover:text-accent hover:underline" href="https://help.shopify.com" target="_blank" rel="noreferrer">
                  Merchant documentation ↗
                </a>
              </li>
              <li>
                <button className="hover:text-accent hover:underline" onClick={() => setGlobalSearchOpen(true)}>
                  Search shortcuts (press /)
                </button>
              </li>
            </ul>
          </div>
        </Popover>
        <Notifications />
        <AccountMenu />
      </div>
    </header>
  )
}
