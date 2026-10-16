import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { currentTenant } from '../../common/tenant.middleware'
import { uid, roundMoney } from '../../common/ids'
import { parseJson, toConnection } from '../../common/helpers'

export interface CreateReviewInput {
  productId: string
  customerName: string
  customerEmail: string
  rating: number
  title: string
  body: string
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves whether customerEmail has an order containing productId that has been paid
   */
  async checkVerifiedBuyer(storeId: string, productId: string, customerEmail: string): Promise<boolean> {
    const rawProductId = productId.split('/').pop() || productId
    const email = customerEmail.trim().toLowerCase()

    const orders = await this.prisma.order.findMany({
      where: {
        storeId,
        isDraft: false,
      },
      select: {
        email: true,
        paymentStatus: true,
        lineItems: true,
      },
    })

    for (const o of orders) {
      if (o.email.toLowerCase() === email && (o.paymentStatus === 'paid' || o.paymentStatus === 'partially_refunded')) {
        const lineItems = parseJson<Array<{ productId: string }>>(o.lineItems as string, [])
        if (lineItems.some((li) => li.productId === rawProductId || li.productId === productId)) {
          return true
        }
      }
    }

    return false
  }

  /**
   * Submits a customer review with automatic Verified Buyer resolution
   */
  async createReview(input: CreateReviewInput) {
    const tenant = currentTenant()
    const rawProductId = input.productId.split('/').pop() || input.productId
    const rating = Math.min(5, Math.max(1, Math.round(input.rating)))
    const isVerified = await this.checkVerifiedBuyer(tenant.id, rawProductId, input.customerEmail)

    const review = await this.prisma.productReview.create({
      data: {
        id: uid('rev'),
        storeId: tenant.id,
        productId: rawProductId,
        customerName: input.customerName.trim(),
        customerEmail: input.customerEmail.trim().toLowerCase(),
        rating,
        title: input.title.trim(),
        body: input.body.trim(),
        status: 'published',
        isVerifiedBuyer: isVerified,
      },
    })

    return {
      review: {
        id: `gid://shopify/ProductReview/${review.id}`,
        customerName: review.customerName,
        rating: review.rating,
        title: review.title,
        body: review.body,
        isVerifiedBuyer: review.isVerifiedBuyer,
        adminReply: review.adminReply,
        createdAt: review.createdAt.toISOString(),
      },
      userErrors: [],
    }
  }

  /**
   * Calculates aggregate ratings (average, count) for a product
   */
  async getProductReviewsSummary(storeId: string, productId: string) {
    const rawProductId = productId.split('/').pop() || productId
    const reviews = await this.prisma.productReview.findMany({
      where: {
        storeId,
        productId: rawProductId,
        status: 'published',
      },
      orderBy: { createdAt: 'desc' },
    })

    const count = reviews.length
    const totalScore = reviews.reduce((sum, r) => sum + r.rating, 0)
    const average = count > 0 ? roundMoney(totalScore / count) : 5.0

    return {
      reviews: reviews.map((r) => ({
        id: `gid://shopify/ProductReview/${r.id}`,
        customerName: r.customerName,
        rating: r.rating,
        title: r.title,
        body: r.body,
        isVerifiedBuyer: r.isVerifiedBuyer,
        adminReply: r.adminReply,
        createdAt: r.createdAt.toISOString(),
      })),
      reviewsCount: count,
      averageRating: average,
    }
  }

  /**
   * Admin list query with filtering by status and rating
   */
  async listReviews(args: {
    status?: string
    rating?: number
    query?: string
    first?: number
    after?: string
  }) {
    const tenant = currentTenant()
    const where: Record<string, unknown> = { storeId: tenant.id }
    if (args.status && args.status !== 'all') {
      where.status = args.status.toLowerCase()
    }
    if (args.rating && args.rating > 0) {
      where.rating = args.rating
    }

    let rows = await this.prisma.productReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    if (args.query?.trim()) {
      const q = args.query.toLowerCase().trim()
      rows = rows.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.body.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.customerEmail.toLowerCase().includes(q),
      )
    }

    // Attach product title and thumbnail
    const products = await this.prisma.product.findMany({
      where: { storeId: tenant.id },
      select: { id: true, title: true, media: true },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))

    const decorated = rows.map((r) => {
      const prod = productMap.get(r.productId)
      const mediaList = parseJson<Array<{ src: string }>>(prod?.media as string, [])
      return {
        id: `gid://shopify/ProductReview/${r.id}`,
        storeId: r.storeId,
        productId: r.productId,
        productTitle: prod?.title || 'Catalog Product',
        productImage: mediaList[0]?.src || '/images/products/classic-cotton-t-shirt.svg',
        customerId: r.customerId,
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        rating: r.rating,
        title: r.title,
        body: r.body,
        status: r.status,
        isVerifiedBuyer: r.isVerifiedBuyer,
        adminReply: r.adminReply,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }
    })

    return toConnection(decorated, args.first || 50, args.after)
  }

  async updateReviewStatus(id: string, status: string) {
    const rawId = id.split('/').pop() || id
    const review = await this.prisma.productReview.update({
      where: { id: rawId },
      data: { status: status.toLowerCase() },
    })
    return {
      review: {
        id: `gid://shopify/ProductReview/${review.id}`,
        status: review.status,
      },
      userErrors: [],
    }
  }

  async replyToReview(id: string, reply: string) {
    const rawId = id.split('/').pop() || id
    const review = await this.prisma.productReview.update({
      where: { id: rawId },
      data: { adminReply: reply.trim() },
    })
    return {
      review: {
        id: `gid://shopify/ProductReview/${review.id}`,
        adminReply: review.adminReply,
      },
      userErrors: [],
    }
  }

  async deleteReview(id: string) {
    const rawId = id.split('/').pop() || id
    await this.prisma.productReview.delete({
      where: { id: rawId },
    })
    return {
      deletedId: id,
      userErrors: [],
    }
  }
}
