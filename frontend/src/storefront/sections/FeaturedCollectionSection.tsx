import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingBag } from 'lucide-react'
import { getStorefrontProducts, type StorefrontProduct } from '../../services/storefrontClient'
import { useStorefrontCart } from '../../store/useStorefrontCart'

export interface FeaturedCollectionSettings {
  title?: string
  subtitle?: string
  productsToShow?: number
  columns?: number
  showVendor?: boolean
  showQuickAdd?: boolean
}

export function FeaturedCollectionSection({ settings }: { settings: FeaturedCollectionSettings }) {
  const [products, setProducts] = useState<StorefrontProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [addingId, setAddingId] = useState<string | null>(null)
  const { addItem } = useStorefrontCart()

  const title = settings.title || 'Featured Products'
  const subtitle = settings.subtitle || 'Our top selling items handcrafted with premium materials'
  const count = Number(settings.productsToShow) || 8
  const showVendor = settings.showVendor !== false
  const showQuickAdd = settings.showQuickAdd !== false

  useEffect(() => {
    let mounted = true
    getStorefrontProducts(count)
      .then((prods) => {
        if (mounted) {
          setProducts(prods)
          setLoading(false)
        }
      })
      .catch(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [count])

  const handleQuickAdd = async (product: StorefrontProduct) => {
    const firstVariant = product.variants.edges[0]?.node
    if (!firstVariant) return
    setAddingId(product.id)
    await addItem(firstVariant.id, 1)
    setAddingId(null)
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">{title}</h2>
          {subtitle && <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse space-y-3">
              <div className="aspect-square bg-neutral-100 rounded-xl" />
              <div className="h-4 bg-neutral-100 rounded w-3/4" />
              <div className="h-3 bg-neutral-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.slice(0, count).map((p) => {
            const primaryImg =
              p.featuredImage?.url || p.images[0]?.url || '/images/products/classic-cotton-t-shirt.svg'
            const minPrice = p.priceRange.minVariantPrice.amount
            const currency = p.priceRange.minVariantPrice.currencyCode
            const compareAt = p.compareAtPriceRange?.maxVariantPrice.amount
            const isOnSale = compareAt && compareAt > minPrice
            const isAvailable = p.availableForSale

            return (
              <div
                key={p.id}
                className="group relative flex flex-col rounded-xl bg-white border border-neutral-200/90 overflow-hidden hover:border-neutral-300 hover:shadow-md transition"
              >
                <Link
                  to={`/store/products/${p.handle}`}
                  className="aspect-square bg-neutral-50 relative overflow-hidden block"
                >
                  <img
                    src={primaryImg}
                    alt={p.title}
                    className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                  />
                  {isOnSale && (
                    <span className="absolute top-2.5 left-2.5 bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
                      Sale
                    </span>
                  )}
                  {!isAvailable && (
                    <span className="absolute top-2.5 left-2.5 bg-neutral-800 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                      Sold Out
                    </span>
                  )}
                </Link>

                <div className="p-4 flex flex-col flex-1">
                  {showVendor && p.vendor && (
                    <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                      {p.vendor}
                    </span>
                  )}
                  <Link
                    to={`/store/products/${p.handle}`}
                    className="text-sm font-semibold text-neutral-900 hover:text-neutral-600 line-clamp-1 mt-0.5"
                  >
                    {p.title}
                  </Link>

                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-sm font-bold text-neutral-900">
                      ${minPrice.toFixed(2)} {currency}
                    </span>
                    {isOnSale && (
                      <span className="text-xs text-neutral-400 line-through">
                        ${compareAt.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {showQuickAdd && (
                    <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuickAdd(p)}
                        disabled={!isAvailable || addingId === p.id}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-neutral-900 text-white py-2 text-xs font-semibold hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        {addingId === p.id ? (
                          <span className="inline-block animate-spin mr-1">↻</span>
                        ) : (
                          <ShoppingBag size={13} />
                        )}
                        Quick Add
                      </button>
                      <Link
                        to={`/store/products/${p.handle}`}
                        className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50 transition"
                      >
                        Options
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
