import { useEffect, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { ShoppingBag, ArrowLeft, ShieldCheck, Sparkles, User } from 'lucide-react'
import { useStorefrontCart } from '@/store/useStorefrontCart'
import { useStorefrontCustomer } from '@/store/useStorefrontCustomer'
import { StorefrontCartDrawer } from './StorefrontCartDrawer'
import { getStorefrontShop, type StorefrontShop } from '@/services/storefrontClient'

export function StorefrontLayout() {
  const { cart, toggleCart, initCart } = useStorefrontCart()
  const { customer, isAuthenticated, init: initCustomer } = useStorefrontCustomer()
  const [shop, setShop] = useState<StorefrontShop | null>(null)

  useEffect(() => {
    initCustomer()
  }, [initCustomer])

  useEffect(() => {
    initCart()
    getStorefrontShop()
      .then(setShop)
      .catch(() => {
        setShop({
          id: 'gid://shopify/Shop/singleton',
          name: 'Northstar Goods',
          description: 'A modern goods store for everyday adventure.',
          moneyFormat: '${{amount}}',
          primaryDomain: { host: 'northstargoods.com', url: 'https://northstargoods.com' },
          paymentSettings: { currencyCode: 'USD', acceptedCardBrands: ['VISA', 'MASTERCARD'] },
        })
      })
  }, [initCart])

  const totalQuantity = cart?.totalQuantity ?? 0

  return (
    <div className="min-h-screen flex flex-col bg-white text-neutral-900 font-sans selection:bg-neutral-900 selection:text-white">
      {/* Announcement Bar */}
      <div className="bg-neutral-900 text-neutral-200 text-xs py-2 px-4 text-center font-medium flex items-center justify-center gap-2 tracking-wide">
        <Sparkles size={13} className="text-amber-400" />
        <span>Complimentary domestic express shipping on orders over $75</span>
        <span className="hidden md:inline text-neutral-400">· 30-Day Hassle-Free Returns</span>
      </div>

      {/* Main Storefront Navigation Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-neutral-200/80 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Left: Brand / Logo */}
          <div className="flex items-center gap-8">
            <Link to={`/store${window.location.search}`} className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center font-bold text-sm tracking-tighter group-hover:bg-neutral-800 transition">
                {(shop?.name || 'N').charAt(0).toUpperCase()}
              </div>
              <span className="text-base font-bold tracking-tight text-neutral-900">
                {shop?.name || 'Northstar Goods'}
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-neutral-600">
              <Link to={`/store${window.location.search}`} className="hover:text-neutral-900 transition">
                Catalog
              </Link>
              <a href="#featured-collections" className="hover:text-neutral-900 transition">
                Collections
              </a>
              <a href="#about" className="hover:text-neutral-900 transition">
                Our Story
              </a>
            </nav>
          </div>

          {/* Right: Account, Return to Admin & Cart Button */}
          <div className="flex items-center gap-3">
            {/* Customer Account Button */}
            <Link
              to={isAuthenticated ? '/store/account' : '/store/account/login'}
              className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-150 px-3 py-1.5 rounded-full transition"
              title={isAuthenticated ? 'Account Dashboard' : 'Sign in'}
            >
              <User size={14} className="text-neutral-500" />
              <span className="hidden sm:inline">
                {isAuthenticated ? customer?.firstName || 'Account' : 'Sign in'}
              </span>
            </Link>

            <Link
              to="/"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-150 px-3 py-1.5 rounded-md transition"
            >
              <ArrowLeft size={13} />
              Merchant Admin
            </Link>
            <button
              type="button"
              onClick={toggleCart}
              className="relative flex items-center gap-2 rounded-full bg-neutral-100 hover:bg-neutral-200/80 px-3.5 py-2 text-sm font-medium text-neutral-900 transition active:scale-95"
              aria-label="Open Cart"
            >
              <ShoppingBag size={16} />
              <span className="text-xs font-semibold">{totalQuantity}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        <Outlet context={{ shop }} />
      </main>

      {/* Slide-over Cart Drawer */}
      <StorefrontCartDrawer />

      {/* Storefront Footer */}
      <footer className="bg-neutral-50 border-t border-neutral-200 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-md bg-neutral-900 text-white flex items-center justify-center font-bold text-xs">
                  N
                </div>
                <span className="text-base font-bold text-neutral-900">{shop?.name || 'Northstar Goods'}</span>
              </div>
              <p className="text-sm text-neutral-500 max-w-sm mb-4">
                Thoughtfully crafted apparel, durable travel bags, and functional home goods engineered for everyday resilience.
              </p>
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <ShieldCheck size={14} className="text-emerald-600" />
                <span>Shopify Storefront API Verified Platform</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-900 mb-3">Shop</h4>
              <ul className="space-y-2 text-sm text-neutral-600">
                <li><Link to="/store" className="hover:text-neutral-900 transition">All Products</Link></li>
                <li><a href="#featured-collections" className="hover:text-neutral-900 transition">Featured Collections</a></li>
                <li><Link to="/store/checkout" className="hover:text-neutral-900 transition">Quick Checkout</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-900 mb-3">Platform</h4>
              <ul className="space-y-2 text-sm text-neutral-600">
                <li><Link to="/" className="hover:text-neutral-900 transition">Merchant Backoffice</Link></li>
                <li><span className="text-neutral-400">GraphQL Storefront Engine</span></li>
                <li><span className="text-neutral-400">Shopify Admin 2026-10 Parity</span></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-neutral-200/80 pt-8 flex flex-col md:flex-row items-center justify-between text-xs text-neutral-400 gap-4">
            <p>© {new Date().getFullYear()} {shop?.name || 'Northstar Goods'}. Built with Shopify Storefront GraphQL.</p>
            <div className="flex gap-4">
              <span>Privacy Policy</span>
              <span>Terms of Service</span>
              <span>Shipping Policy</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
