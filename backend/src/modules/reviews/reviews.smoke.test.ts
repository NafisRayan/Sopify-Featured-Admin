import assert from 'node:assert/strict'
import test from 'node:test'
import { tenantContext } from '../../common/tenant.middleware'
import { ReviewsService } from '../products/reviews.service'
test('Product Reviews & Verified Buyer Engine: Submit Review -> Verified Resolution -> Admin Moderation -> Aggregate Rating', async () => {
  const reviewsDb: any[] = []
  const ordersDb: any[] = [
    {
      id: 'ord_1',
      storeId: 'store_northstar',
      email: 'verified.buyer@example.com',
      paymentStatus: 'paid',
      isDraft: false,
      lineItems: JSON.stringify([
        { productId: 'prod_blanket', title: 'Wool Blanket', quantity: 1, price: 95.0 },
      ]),
    },
  ]

  const mockPrisma = {
    order: {
      findMany: async () => ordersDb,
    },
    product: {
      findMany: async () => [
        { id: 'prod_blanket', title: 'Wool Blanket', media: '[]' },
      ],
    },
    productReview: {
      create: async ({ data }: any) => {
        const item = { ...data, createdAt: new Date(), updatedAt: new Date() }
        reviewsDb.push(item)
        return item
      },
      findMany: async ({ where }: any) => {
        let res = reviewsDb
        if (where?.storeId) res = res.filter((r) => r.storeId === where.storeId)
        if (where?.productId) res = res.filter((r) => r.productId === where.productId)
        if (where?.status) res = res.filter((r) => r.status === where.status)
        return res
      },
      update: async ({ where, data }: any) => {
        const item = reviewsDb.find((r) => r.id === where.id)
        if (item) Object.assign(item, data)
        return item
      },
      delete: async ({ where }: any) => {
        const idx = reviewsDb.findIndex((r) => r.id === where.id)
        if (idx >= 0) reviewsDb.splice(idx, 1)
      },
    },
  }

  const reviewsService = new ReviewsService(mockPrisma as any)

  await tenantContext.run({ id: 'store_northstar', name: 'Northstar Goods', slug: 'northstar', currency: 'USD' }, async () => {
    // 1. Submit review from customer who bought the product -> verified buyer
    const rev1 = await reviewsService.createReview({
      productId: 'prod_blanket',
      customerName: 'Verified Alice',
      customerEmail: 'verified.buyer@example.com',
      rating: 5,
      title: 'Warm and impeccably stitched',
      body: 'Best wool blanket I own.',
    })

    assert.equal(rev1.review.rating, 5)
    assert.equal(rev1.review.isVerifiedBuyer, true, 'Customer with paid order must resolve as Verified Buyer')

    // 2. Submit review from visitor who did not purchase product -> unverified
    const rev2 = await reviewsService.createReview({
      productId: 'prod_blanket',
      customerName: 'Anonymous Bob',
      customerEmail: 'unverified.guest@example.com',
      rating: 4,
      title: 'Good texture',
      body: 'Feels nice to the touch.',
    })
    assert.equal(rev2.review.isVerifiedBuyer, false, 'Guest without order must resolve as unverified')

    // 3. Verify Product Aggregate Rating: (5 + 4) / 2 = 4.5 average
    const summary = await reviewsService.getProductReviewsSummary('store_northstar', 'prod_blanket')
    assert.equal(summary.reviewsCount, 2)
    assert.equal(summary.averageRating, 4.5)

    // 4. Admin updates review status to hidden
    const rawId2 = rev2.review.id.split('/').pop()!
    const updated = await reviewsService.updateReviewStatus(rawId2, 'hidden')
    assert.equal(updated.review.status, 'hidden')

    // 5. Admin replies to review
    const rawId1 = rev1.review.id.split('/').pop()!
    const replied = await reviewsService.replyToReview(rawId1, 'Thank you Alice for supporting our craft!')
    assert.equal(replied.review.adminReply, 'Thank you Alice for supporting our craft!')

    // Aggregate rating excludes hidden reviews: only rev1 (5.0) remains published
    const afterHide = await reviewsService.getProductReviewsSummary('store_northstar', 'prod_blanket')
    assert.equal(afterHide.reviewsCount, 1)
    assert.equal(afterHide.averageRating, 5.0)
  })
})
