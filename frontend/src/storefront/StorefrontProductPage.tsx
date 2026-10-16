import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ShoppingBag, ArrowLeft, Check, Shield, Truck, Star, CheckCircle2, MessageSquare, Plus, CornerDownRight } from 'lucide-react'
import {
  getStorefrontProduct,
  submitProductReview,
  type StorefrontProduct,
  type StorefrontProductVariant,
} from '@/services/storefrontClient'
import { useStorefrontCart } from '@/store/useStorefrontCart'

export function StorefrontProductPage() {
  const { handle } = useParams<{ handle: string }>()
  const [product, setProduct] = useState<StorefrontProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedVariant, setSelectedVariant] = useState<StorefrontProductVariant | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})
  const [quantity, setQuantity] = useState(1)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [isAdding, setIsAdding] = useState(false)
  const [addSuccess, setAddSuccess] = useState(false)
  const { addItem, error } = useStorefrontCart()

  // Reviews modal and state
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [revRating, setRevRating] = useState(5)
  const [revTitle, setRevTitle] = useState('')
  const [revBody, setRevBody] = useState('')
  const [revName, setRevName] = useState('')
  const [revEmail, setRevEmail] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [reviewToast, setReviewToast] = useState<string | null>(null)
  useEffect(() => {
    if (!handle) return
    setLoading(true)
    getStorefrontProduct(handle)
      .then((p) => {
        setProduct(p)
        if (p?.variants.edges.length) {
          const first = p.variants.edges[0].node
          setSelectedVariant(first)
          const initialOpts: Record<string, string> = {}
          first.selectedOptions.forEach((opt) => {
            initialOpts[opt.name] = opt.value
          })
          setSelectedOptions(initialOpts)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [handle])

  const handleOptionChange = (optionName: string, value: string) => {
    if (!product) return
    const nextOptions = { ...selectedOptions, [optionName]: value }
    setSelectedOptions(nextOptions)

    // Find matching variant
    const matched = product.variants.edges.find((e) => {
      const v = e.node
      return v.selectedOptions.every((opt) => nextOptions[opt.name] === opt.value)
    })
    if (matched) {
      setSelectedVariant(matched.node)
      // Automatic Gallery Image Swapping: if variant has an assigned photo, switch gallery viewer
      if (matched.node.image?.url) {
        const imgIdx = product.images.findIndex((img) => img.url === matched.node.image?.url)
        if (imgIdx >= 0) {
          setActiveImageIndex(imgIdx)
        }
      }
    }
  }

  const handleAddToCart = async () => {
    if (!selectedVariant) return
    setIsAdding(true)
    setAddSuccess(false)
    const success = await addItem(selectedVariant.id, quantity)
    setIsAdding(false)
    if (success) {
      setAddSuccess(true)
      setTimeout(() => setAddSuccess(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 animate-pulse grid grid-cols-1 md:grid-cols-2 gap-12">
        <div className="aspect-square bg-neutral-100 rounded-2xl" />
        <div className="space-y-4">
          <div className="h-8 bg-neutral-100 rounded w-3/4" />
          <div className="h-6 bg-neutral-100 rounded w-1/4" />
          <div className="h-24 bg-neutral-100 rounded w-full" />
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 mb-2">Product Not Found</h2>
        <p className="text-neutral-500 mb-6">The requested product could not be loaded from the storefront catalog.</p>
        <Link
          to="/store"
          className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white"
        >
          <ArrowLeft size={16} /> Back to Catalog
        </Link>
      </div>
    )
  }

  const images = product.images.length > 0
    ? product.images
    : [{ url: '/images/products/classic-cotton-t-shirt.svg', altText: product.title }]
  const activeImage = images[activeImageIndex] || images[0]

  const price = selectedVariant?.price.amount ?? product.priceRange.minVariantPrice.amount
  const currency = selectedVariant?.price.currencyCode ?? 'USD'
  const compareAt = selectedVariant?.compareAtPrice?.amount
  const isAvailable = selectedVariant ? selectedVariant.availableForSale : product.availableForSale
  const qtyAvailable = selectedVariant?.quantityAvailable

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs font-medium text-neutral-500 mb-8">
        <Link to="/store" className="hover:text-neutral-900 transition">Store</Link>
        <span>/</span>
        <span className="text-neutral-400 capitalize">{product.productType || 'Goods'}</span>
        <span>/</span>
        <span className="text-neutral-900 font-semibold truncate">{product.title}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
        {/* Media Gallery */}
        <div className="space-y-4">
          <div className="aspect-square rounded-2xl bg-neutral-50 border border-neutral-200 overflow-hidden relative">
            <img
              src={activeImage.url}
              alt={activeImage.altText || product.title}
              className="w-full h-full object-cover"
            />
            {compareAt && compareAt > price && (
              <span className="absolute top-4 left-4 bg-red-600 text-white text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs">
                Sale
              </span>
            )}
          </div>

          {/* Thumbnail list */}
          {images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImageIndex(idx)}
                  className={`w-20 h-20 rounded-xl overflow-hidden border-2 shrink-0 transition ${
                    activeImageIndex === idx
                      ? 'border-neutral-900 ring-2 ring-neutral-900/10'
                      : 'border-neutral-200 opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Details & Variant Form */}
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            {product.vendor}
          </span>
          <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight mt-1 mb-3">
            {product.title}
          </h1>

          {/* Pricing & Stock indicator */}
          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-2xl font-bold text-neutral-900">
              ${price.toFixed(2)} {currency}
            </span>
            {compareAt && compareAt > price && (
              <span className="text-base text-neutral-400 line-through">
                ${compareAt.toFixed(2)}
              </span>
            )}
            <span
              className={`ml-2 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                isAvailable
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-neutral-100 text-neutral-500 border border-neutral-200'
              }`}
            >
              {isAvailable
                ? qtyAvailable != null
                  ? `In Stock (${qtyAvailable} available)`
                  : 'In Stock'
                : 'Sold Out'}
            </span>
          </div>

          <div className="border-t border-neutral-200 pt-6 mb-6">
            <p className="text-sm text-neutral-600 leading-relaxed">
              {product.description || 'Authentic quality product crafted with premium materials.'}
            </p>
          </div>

          {/* Options / Swatches */}
          {product.options.map((opt) => (
            <div key={opt.id} className="mb-6">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-800 mb-2">
                {opt.name}: <span className="font-normal text-neutral-500">{selectedOptions[opt.name]}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {opt.values.map((val) => {
                  const isSelected = selectedOptions[opt.name] === val
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleOptionChange(opt.name, val)}
                      className={`px-4 py-2 text-xs font-medium rounded-lg border transition ${
                        isSelected
                          ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      {val}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Quantity and Primary CTA */}
          <div className="mt-4 pt-6 border-t border-neutral-200 flex flex-col sm:flex-row gap-4">
            <div className="flex items-center border border-neutral-200 rounded-lg max-w-[120px] self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="px-3.5 py-3 text-sm text-neutral-600 hover:bg-neutral-50 transition"
              >
                -
              </button>
              <span className="flex-1 text-center text-sm font-semibold text-neutral-800">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                className="px-3.5 py-3 text-sm text-neutral-600 hover:bg-neutral-50 transition"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={handleAddToCart}
              disabled={!isAvailable || isAdding}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-3 px-6 text-sm font-semibold text-white shadow-md transition active:scale-[0.99] ${
                !isAvailable
                  ? 'bg-neutral-300 cursor-not-allowed'
                  : addSuccess
                  ? 'bg-emerald-600'
                  : 'bg-neutral-900 hover:bg-neutral-800'
              }`}
            >
              {isAdding ? (
                <span className="inline-block animate-spin mr-1">↻</span>
              ) : addSuccess ? (
                <>
                  <Check size={16} /> Added to Cart!
                </>
              ) : (
                <>
                  <ShoppingBag size={16} />
                  {isAvailable ? 'Add to Cart' : 'Sold Out'}
                </>
              )}
            </button>
          </div>

          {error && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-100">
              {error}
            </p>
          )}

          {/* Shipping / Trust Notes */}
          <div className="mt-10 pt-6 border-t border-neutral-200/80 space-y-3">
            <div className="flex items-center gap-3 text-xs text-neutral-600">
              <Truck size={16} className="text-neutral-400 shrink-0" />
              <span>Complimentary shipping on orders over $75. Dispatches within 24 hours.</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-neutral-600">
              <Shield size={16} className="text-neutral-400 shrink-0" />
              <span>Backed by 30-day money-back guarantee and official Shopify order protection.</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Customer Reviews & Social Proof Section ────────────────────── */}
      <div className="mt-16 pt-12 border-t border-neutral-200 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-neutral-100">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Customer Reviews</h2>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex text-amber-400">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    fill={i < Math.round(product.averageRating || 5) ? 'currentColor' : 'none'}
                    className={i < Math.round(product.averageRating || 5) ? 'text-amber-400' : 'text-neutral-300'}
                  />
                ))}
              </div>
              <span className="text-sm font-bold text-neutral-900">
                {(product.averageRating || 5.0).toFixed(1)} out of 5
              </span>
              <span className="text-xs text-neutral-400">
                Based on {product.reviewsCount || 0} reviews
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setReviewModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 transition"
          >
            <Plus size={14} /> Write a Review
          </button>
        </div>

        {reviewToast && (
          <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{reviewToast}</span>
          </div>
        )}

        {/* Reviews List */}
        {!product.reviews?.length ? (
          <div className="text-center py-12 bg-neutral-50 rounded-2xl border border-neutral-150">
            <MessageSquare size={28} className="text-neutral-400 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-neutral-900">No reviews yet</h3>
            <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
              Be the first to review this product and share your experience with the community.
            </p>
            <button
              type="button"
              onClick={() => setReviewModalOpen(true)}
              className="mt-4 px-4 py-2 rounded-lg bg-neutral-900 text-white text-xs font-semibold"
            >
              Write the first review
            </button>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 space-y-6">
            {product.reviews.map((rev) => {
              const dateStr = new Date(rev.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
              return (
                <div key={rev.id} className="pt-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-neutral-900">{rev.customerName}</span>
                      {rev.isVerifiedBuyer && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={10} /> Verified Buyer
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-neutral-400">{dateStr}</span>
                  </div>

                  <div className="flex text-amber-400">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        size={13}
                        fill={i < rev.rating ? 'currentColor' : 'none'}
                        className={i < rev.rating ? 'text-amber-400' : 'text-neutral-300'}
                      />
                    ))}
                  </div>

                  <h4 className="text-sm font-bold text-neutral-900">{rev.title}</h4>
                  <p className="text-xs text-neutral-600 leading-relaxed">{rev.body}</p>

                  {rev.adminReply && (
                    <div className="mt-3 ml-4 p-3 bg-neutral-50 rounded-xl border-l-2 border-neutral-900 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-neutral-900">
                        <CornerDownRight size={12} className="text-neutral-400" />
                        <span>Store Response</span>
                      </div>
                      <p className="text-neutral-600">{rev.adminReply}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Write a Review Modal */}
      {reviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="text-base font-bold text-neutral-900">Write a Review</h3>
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="text-xs text-neutral-400 hover:text-neutral-700"
              >
                Cancel
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setSubmittingReview(true)
                try {
                  const { review, userErrors } = await submitProductReview({
                    productId: product.id,
                    customerName: revName.trim(),
                    customerEmail: revEmail.trim().toLowerCase(),
                    rating: revRating,
                    title: revTitle.trim(),
                    body: revBody.trim(),
                  })
                  if (review) {
                    setReviewToast('Review submitted successfully! Thank you for your feedback.')
                    setReviewModalOpen(false)
                    // re-fetch product details
                    getStorefrontProduct(handle!).then((p) => p && setProduct(p))
                  } else if (userErrors.length) {
                    alert(userErrors[0].message)
                  }
                } finally {
                  setSubmittingReview(false)
                }
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Your Rating</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRevRating(star)}
                      className="p-1 hover:scale-110 transition"
                    >
                      <Star
                        size={22}
                        fill={star <= revRating ? '#fbbf24' : 'none'}
                        className={star <= revRating ? 'text-amber-400' : 'text-neutral-300'}
                      />
                    </button>
                  ))}
                  <span className="text-xs font-bold text-neutral-800 ml-2">{revRating} / 5 Stars</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Your Name</label>
                  <input
                    type="text"
                    required
                    value={revName}
                    onChange={(e) => setRevName(e.target.value)}
                    placeholder="e.g. Sarah C."
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={revEmail}
                    onChange={(e) => setRevEmail(e.target.value)}
                    placeholder="sarah@example.com"
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Review Headline</label>
                <input
                  type="text"
                  required
                  value={revTitle}
                  onChange={(e) => setRevTitle(e.target.value)}
                  placeholder="Summarize your experience (e.g. Exceptional build quality)"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Review Details</label>
                <textarea
                  rows={3}
                  required
                  value={revBody}
                  onChange={(e) => setRevBody(e.target.value)}
                  placeholder="How does the product fit? What did you like or dislike about the craftsmanship?"
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs focus:border-neutral-900 outline-none"
                />
              </div>

              <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  className="px-4 py-2 font-semibold text-neutral-600 hover:text-neutral-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="px-5 py-2 font-bold text-white bg-neutral-900 rounded-xl hover:bg-neutral-800 disabled:opacity-40 transition"
                >
                  {submittingReview ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
