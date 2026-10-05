import { Link } from 'react-router-dom'
import {
  Bell, CreditCard, FileText, Globe, Link2, ListTree, Percent, ReceiptText, Settings as SettingsIcon,
  ShoppingBag, Truck, Users, ScrollText, Languages, MapPinned,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { Card, PageHeader } from '@/components/ui'

const SECTIONS: { to: string; icon: typeof Globe; title: string; describe: string }[] = [
  { to: '/settings/general', icon: Globe, title: 'General', describe: 'Store details, billing address, standards and format' },
  { to: '/settings/billing', icon: CreditCard, title: 'Plan and billing', describe: 'View your plan, billing cycle and invoices' },
  { to: '/settings/payments', icon: CreditCard, title: 'Payments', describe: 'Accept payments with payment providers' },
  { to: '/settings/checkout', icon: ShoppingBag, title: 'Checkout', describe: 'Customer accounts, checkout language and more' },
  { to: '/settings/shipping', icon: Truck, title: 'Shipping and delivery', describe: 'Manage shipping rates and methods' },
  { to: '/settings/taxes', icon: Percent, title: 'Taxes and duties', describe: 'Set up tax rates and exemptions' },
  { to: '/locations', icon: ReceiptText, title: 'Locations', describe: 'Places you sell, ship, or fulfill from' },
  { to: '/settings/users', icon: Users, title: 'Users and permissions', describe: 'Add and control staff access to your admin' },
  { to: '/settings/notifications', icon: Bell, title: 'Notifications', describe: 'Customer email notifications and more' },
  { to: '/settings/policies', icon: FileText, title: 'Policies', describe: 'Refund, privacy, terms of service and shipping policies' },
  { to: '/settings/domains', icon: Link2, title: 'Domains', describe: 'Connect domains, set the primary domain and payout schedule' },
  { to: '/settings/markets', icon: MapPinned, title: 'Markets', describe: 'International countries, currencies and price adjustment' },
  { to: '/settings/languages', icon: Languages, title: 'Languages', describe: 'Locales available on your storefront' },
  { to: '/settings/metafields', icon: ListTree, title: 'Metafields', describe: 'Custom fields for products, customers and orders' },
  { to: '/settings/activity', icon: ScrollText, title: 'Activity log', describe: 'Staff actions taken across the admin' },
]

export default function SettingsIndexPage() {
  const appsCount = useStore((s) => s.apps.filter((a) => a.status === 'installed').length)
  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your store's configuration" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          return (
            <Link key={s.to} to={s.to}>
              <Card className="flex h-full items-start gap-3 transition-colors hover:border-border-strong">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f1f1f1]">
                  <Icon size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{s.title}</span>
                  <span className="mt-0.5 block text-xs text-text-muted">{s.describe}</span>
                </span>
              </Card>
            </Link>
          )
        })}
        <Link to="/apps">
          <Card className="flex h-full items-start gap-3 transition-colors hover:border-border-strong">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f1f1f1]">
              <SettingsIcon size={16} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">Apps and sales channels</span>
              <span className="mt-0.5 block text-xs text-text-muted">{appsCount} apps installed</span>
            </span>
          </Card>
        </Link>
      </div>
    </div>
  )
}
