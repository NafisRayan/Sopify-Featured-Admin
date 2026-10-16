import { useState, useEffect } from 'react'
import {
  Star,
  CheckCircle2,
  Trash2,
  MessageSquare,
  Eye,
  EyeOff,
  CornerDownRight,
} from 'lucide-react'
import { gqlRequest } from '@/services/api'
import { PageHeader } from '@/components/ui/Feedback'
import { Card, Button, Input, Modal, useToast } from '@/components/ui'
import { formatDateTime } from '@/lib/format'

interface AdminReview {
  id: string
  storeId: string
  productId: string
  productTitle: string
  productImage: string
  customerName: string
  customerEmail: string
  rating: number
  title: string
  body: string
  status: 'published' | 'pending' | 'hidden'
  isVerifiedBuyer: boolean
  adminReply?: string | null
  createdAt: string
}

export default function ReviewsListPage() {
  const { toast } = useToast()
  const [reviews, setReviews] = useState<AdminReview[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [ratingFilter, setRatingFilter] = useState<number>(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [replyModalOpen, setReplyModalOpen] = useState(false)
  const [activeReview, setActiveReview] = useState<AdminReview | null>(null)
  const [replyText, setReplyText] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)

  const loadReviews = async () => {
    setLoading(true)
    try {
      const data = await gqlRequest<{
        productReviews: {
          edges: Array<{ node: AdminReview }>
        }
      }>(`
        query GetReviews($status: String, $rating: Int, $query: String) {
          productReviews(status: $status, rating: $rating, query: $query, first: 100) {
            edges {
              node {
                id
                storeId
                productId
                productTitle
                productImage
                customerName
                customerEmail
                rating
                title
                body
                status
                isVerifiedBuyer
                adminReply
                createdAt
              }
            }
          }
        }
      `, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        rating: ratingFilter > 0 ? ratingFilter : undefined,
        query: searchQuery.trim() || undefined,
      })
      const list = data?.productReviews?.edges.map((e) => e.node) || []
      setReviews(list)
    } catch {
      // fallback
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReviews()
  }, [statusFilter, ratingFilter, searchQuery])

  const handleStatusToggle = async (review: AdminReview) => {
    const nextStatus = review.status === 'published' ? 'hidden' : 'published'
    try {
      await gqlRequest(`
        mutation UpdateStatus($id: ID!, $status: String!) {
          productReviewUpdateStatus(id: $id, status: $status) {
            review {
              id
              status
            }
            userErrors {
              message
            }
          }
        }
      `, { id: review.id, status: nextStatus })
      toast(`Review marked as ${nextStatus}`)
      loadReviews()
    } catch (err) {
      toast((err as Error).message, { tone: 'critical' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this customer review permanently?')) return
    try {
      await gqlRequest(`
        mutation DeleteReview($id: ID!) {
          productReviewDelete(id: $id) {
            deletedId
            userErrors {
              message
            }
          }
        }
      `, { id })
      toast('Review deleted')
      loadReviews()
    } catch (err) {
      toast((err as Error).message, { tone: 'critical' })
    }
  }

  const handleSendReply = async () => {
    if (!activeReview || !replyText.trim()) return
    setSubmittingReply(true)
    try {
      await gqlRequest(`
        mutation ReplyReview($id: ID!, $reply: String!) {
          productReviewReply(id: $id, reply: $reply) {
            review {
              id
              adminReply
            }
            userErrors {
              message
            }
          }
        }
      `, { id: activeReview.id, reply: replyText.trim() })
      toast('Merchant reply posted')
      setReplyModalOpen(false)
      setReplyText('')
      loadReviews()
    } catch (err) {
      toast((err as Error).message, { tone: 'critical' })
    } finally {
      setSubmittingReply(false)
    }
  }

  // Summary Metrics
  const totalReviews = reviews.length
  const avgRating =
    totalReviews > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1)
      : '5.0'
  const publishedCount = reviews.filter((r) => r.status === 'published').length
  const hiddenCount = reviews.filter((r) => r.status === 'hidden').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Reviews"
        subtitle="Moderate customer reviews, reply to feedback, and showcase verified social proof."
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-text-muted">Total Reviews</p>
          <p className="mt-1 text-2xl font-bold text-text">{totalReviews}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-muted">Average Rating</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl font-bold text-text">{avgRating}</span>
            <div className="flex text-amber-500">
              <Star size={18} fill="currentColor" />
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-muted">Published</p>
          <p className="mt-1 text-2xl font-bold text-success">{publishedCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-muted">Hidden / Filtered</p>
          <p className="mt-1 text-2xl font-bold text-text-muted">{hiddenCount}</p>
        </Card>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface rounded-xl border border-border p-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {['all', 'published', 'hidden'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition ${
                statusFilter === st
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text'
              }`}
            >
              {st}
            </button>
          ))}
          <div className="h-4 w-px bg-border mx-1" />
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(Number(e.target.value))}
            className="text-xs bg-surface border border-border rounded-lg px-2.5 py-1 text-text outline-none"
          >
            <option value={0}>All Stars</option>
            <option value={5}>5 Stars ★★★★★</option>
            <option value={4}>4 Stars ★★★★</option>
            <option value={3}>3 Stars ★★★</option>
            <option value={2}>2 Stars ★★</option>
            <option value={1}>1 Star ★</option>
          </select>
        </div>

        <div className="w-full sm:w-64 relative">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reviews..."
          />
        </div>
      </div>

      {/* Review Table */}
      <Card padding={false}>
        {loading ? (
          <div className="p-12 text-center text-xs text-text-muted animate-pulse">
            Loading reviews queue...
          </div>
        ) : reviews.length === 0 ? (
          <div className="p-12 text-center text-text-muted space-y-2">
            <MessageSquare size={32} className="mx-auto text-neutral-300" />
            <p className="text-sm font-semibold text-text">No reviews found</p>
            <p className="text-xs">Customer reviews submitted on your storefront appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-border overflow-x-auto">
            {reviews.map((rev) => (
              <div key={rev.id} className="p-4 sm:p-5 hover:bg-surface-hover transition space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={rev.productImage}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover bg-neutral-100 border border-border shrink-0"
                    />
                    <div>
                      <span className="text-xs font-bold text-text block">{rev.productTitle}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-text-muted">{rev.customerName}</span>
                        {rev.isVerifiedBuyer && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full">
                            <CheckCircle2 size={10} /> Verified Buyer
                          </span>
                        )}
                        <span className="text-xs text-text-muted font-mono">{rev.customerEmail}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        rev.status === 'published'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-neutral-100 text-neutral-600 border border-border'
                      }`}
                    >
                      {rev.status}
                    </span>
                    <span className="text-xs text-text-muted">{formatDateTime(rev.createdAt)}</span>
                  </div>
                </div>

                <div className="space-y-1 pl-13">
                  <div className="flex text-amber-400">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        size={12}
                        fill={i < rev.rating ? 'currentColor' : 'none'}
                        className={i < rev.rating ? 'text-amber-400' : 'text-neutral-300'}
                      />
                    ))}
                  </div>
                  <h4 className="text-sm font-semibold text-text">{rev.title}</h4>
                  <p className="text-xs text-text-muted leading-relaxed max-w-3xl">{rev.body}</p>

                  {rev.adminReply && (
                    <div className="mt-2.5 p-2.5 bg-[#f8f8f8] rounded-lg border-l-2 border-neutral-900 text-xs text-text-muted space-y-0.5">
                      <span className="font-bold text-text flex items-center gap-1">
                        <CornerDownRight size={11} /> Merchant Reply:
                      </span>
                      <p>{rev.adminReply}</p>
                    </div>
                  )}

                  <div className="pt-2 flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => handleStatusToggle(rev)}
                      className="font-medium text-text hover:underline flex items-center gap-1"
                    >
                      {rev.status === 'published' ? (
                        <>
                          <EyeOff size={12} /> Hide Review
                        </>
                      ) : (
                        <>
                          <Eye size={12} /> Publish Review
                        </>
                      )}
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveReview(rev)
                        setReplyText(rev.adminReply || '')
                        setReplyModalOpen(true)
                      }}
                      className="font-medium text-accent hover:underline flex items-center gap-1"
                    >
                      <MessageSquare size={12} /> {rev.adminReply ? 'Edit Reply' : 'Reply'}
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(rev.id)}
                      className="font-medium text-critical-strong hover:underline flex items-center gap-1"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Reply Modal */}
      <Modal
        open={replyModalOpen}
        onClose={() => setReplyModalOpen(false)}
        title={`Reply to ${activeReview?.customerName}'s review`}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setReplyModalOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={submittingReply || !replyText.trim()}
              onClick={handleSendReply}
            >
              {submittingReply ? 'Posting...' : 'Post Reply'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-text-muted italic">"{activeReview?.body}"</p>
          <div>
            <label className="block text-xs font-semibold text-text mb-1">Official Response</label>
            <textarea
              rows={4}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Thank the customer or address their feedback publicly..."
              className="w-full rounded-lg border border-border p-2.5 text-xs text-text outline-none focus:border-accent"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
