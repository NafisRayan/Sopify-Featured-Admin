import { Resolver, Query, Mutation, Args } from '@nestjs/graphql'
import { ProductsService } from './products.service'

@Resolver('Product')
export class ProductsResolver {
  constructor(private readonly service: ProductsService) {}

  @Query()
  product(@Args('id') id: string) {
    return this.service.product(id)
  }

  @Query()
  products(@Args() args: { first?: number; after?: string; last?: number; before?: string; query?: string; reverse?: boolean; status?: string }) {
    return this.service.products(args)
  }

  @Query()
  collection(@Args('id') id: string) {
    return this.service.collection(id)
  }

  @Query()
  collections(@Args() args: { first?: number; after?: string; last?: number; before?: string; query?: string }) {
    return this.service.collections(args)
  }

  @Mutation()
  async productCreate(@Args('product') product: Record<string, any>) {
    try {
      return { product: await this.service.create(product), userErrors: [] }
    } catch (e) {
      return { product: null, userErrors: [{ field: ['product'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async productUpdate(@Args('id') id: string, @Args('product') product: Record<string, any>) {
    try {
      return { product: await this.service.update(id, product), userErrors: [] }
    } catch (e) {
      return { product: null, userErrors: [{ field: ['product'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async productDelete(@Args('ids') ids: string[]) {
    return { deletedIds: await this.service.delete(ids), userErrors: [] }
  }

  @Mutation()
  async productDuplicate(@Args('id') id: string) {
    try {
      return { product: await this.service.duplicate(id), userErrors: [] }
    } catch (e) {
      return { product: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  productStatusSet(@Args('ids') ids: string[], @Args('status') status: string) {
    return { updatedIds: this.service.setStatus(ids, status), userErrors: [] }
  }

  @Mutation()
  productAddTags(@Args('ids') ids: string[], @Args('tags') tags: string[]) {
    return { updatedIds: this.service.modifyTags(ids, tags, 'add'), userErrors: [] }
  }

  @Mutation()
  productRemoveTags(@Args('ids') ids: string[], @Args('tags') tags: string[]) {
    return { updatedIds: this.service.modifyTags(ids, tags, 'remove'), userErrors: [] }
  }

  @Mutation()
  async productMediaReorder(@Args('id') id: string, @Args('mediaIds') mediaIds: string[]) {
    try {
      return { product: await this.service.reorderMedia(id, mediaIds), userErrors: [] }
    } catch (e) {
      return { product: null, userErrors: [{ field: ['mediaIds'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async productVariantCreate(@Args('input') input: Record<string, unknown>) {
    try {
      return { productVariant: await this.service.createVariant(input), userErrors: [] }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      return { productVariant: null, userErrors: [{ field: ['input'], message }] }
    }
  }

  @Mutation()
  async productVariantUpdate(@Args('id') id: string, @Args('input') input: Record<string, unknown>) {
    try {
      return { productVariant: await this.service.updateVariant(id, input), userErrors: [] }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      return { productVariant: null, userErrors: [{ field: ['id'], message }] }
    }
  }

  @Mutation()
  async productVariantDelete(@Args('id') id: string) {
    try {
      return { deletedProductVariantId: await this.service.deleteVariant(id), userErrors: [] }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      return { deletedProductVariantId: null, userErrors: [{ field: ['id'], message }] }
    }
  }


  @Mutation()
  async collectionCreate(@Args('collection') collection: Record<string, any>) {
    try {
      return { collection: await this.service.createCollection(collection), userErrors: [] }
    } catch (e) {
      return { collection: null, userErrors: [{ field: ['collection'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async collectionUpdate(@Args('id') id: string, @Args('collection') collection: Record<string, any>) {
    try {
      return { collection: await this.service.updateCollection(id, collection), userErrors: [] }
    } catch (e) {
      return { collection: null, userErrors: [{ field: ['collection'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  collectionDelete(@Args('ids') ids: string[]) {
    return { deletedIds: this.service.deleteCollections(ids), userErrors: [] }
  }

  @Mutation()
  async collectionAddProducts(@Args('id') id: string, @Args('productIds') productIds: string[]) {
    try {
      return { collection: await this.service.modifyProducts(id, productIds, 'add'), userErrors: [] }
    } catch (e) {
      return { collection: null, userErrors: [{ field: ['productIds'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async collectionRemoveProducts(@Args('id') id: string, @Args('productIds') productIds: string[]) {
    try {
      return { collection: await this.service.modifyProducts(id, productIds, 'remove'), userErrors: [] }
    } catch (e) {
      return { collection: null, userErrors: [{ field: ['productIds'], message: (e as Error).message }] }
    }
  }
}
