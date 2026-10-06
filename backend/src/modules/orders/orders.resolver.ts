import { Resolver, Query, Mutation, Args } from '@nestjs/graphql'
import { OrdersService } from './orders.service'

@Resolver('Order')
export class OrdersResolver {
  constructor(private readonly service: OrdersService) {}

  @Query()
  order(@Args('id') id: string) {
    return this.service.order(id)
  }

  @Query()
  orders(@Args() args: Record<string, any>) {
    return this.service.orders(args)
  }

  @Query()
  draftOrders(@Args() args: Record<string, any>) {
    return this.service.draftOrders(args)
  }

  @Query()
  ordersCount(
    @Args('query', { nullable: true }) query?: string,
    @Args('status', { nullable: true }) status?: string,
  ) {
    return this.service.ordersCount(query, status)
  }

  @Query()
  draftOrdersCount(@Args('query', { nullable: true }) query?: string) {
    return this.service.draftOrdersCount(query)
  }

  @Query()
  analytics(@Args('from') from: Date, @Args('to') to: Date) {
    return this.service.analytics(from, to)
  }

  @Query()
  abandonedCheckouts(@Args('first') first: number) {
    return this.service.abandonedCheckouts(first)
  }

  @Query()
  returnsForOrder(@Args('orderId') orderId: string) {
    return this.service.returnsForOrder(orderId)
  }

  @Mutation()
  async orderUpdate(@Args('id') id: string, @Args('order') order: Record<string, any>) {
    try {
      return { order: await this.service.update(id, order), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['order'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async orderMarkAsPaid(@Args('id') id: string) {
    try {
      return { order: await this.service.markAsPaid(id), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async orderCancel(@Args('id') id: string, @Args('restock', { nullable: true }) restock: boolean) {
    try {
      return { order: await this.service.cancel(id, restock ?? true), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async orderClose(@Args('id') id: string) {
    try {
      return { order: await this.service.close(id), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async orderReopen(@Args('id') id: string) {
    try {
      return { order: await this.service.reopen(id), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async orderFulfill(@Args('input') input: Record<string, any>) {
    try {
      return { order: await this.service.fulfill(input), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['input'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async orderRefund(@Args('input') input: Record<string, any>) {
    try {
      return { order: await this.service.refund(input), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['input'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async orderEdit(@Args('id') id: string, @Args('added') added: Record<string, any>[], @Args('removed') removed: Record<string, any>[]) {
    try {
      return { order: await this.service.orderEdit(id, added as never, removed as never), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async fulfillmentCancel(@Args('fulfillmentId') fulfillmentId: string) {
    try {
      return { order: await this.service.fulfillmentCancel(fulfillmentId), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['fulfillmentId'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async fulfillmentEventCreate(
    @Args('fulfillmentId') fulfillmentId: string,
    @Args('status') status: string,
    @Args('message', { nullable: true }) message?: string,
  ) {
    try {
      return { order: await this.service.fulfillmentEventCreate(fulfillmentId, status, message), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['input'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async returnCreate(@Args() input: Record<string, any>) {
    try {
      return { return: await this.service.createReturn(input), userErrors: [] }
    } catch (e) {
      return { return: null, userErrors: [{ field: ['input'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async returnClose(@Args('id') id: string, @Args('markRefunded', { nullable: true }) markRefunded: boolean) {
    try {
      return { return: await this.service.closeReturn(id, markRefunded ?? true), userErrors: [] }
    } catch (e) {
      return { return: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async draftOrderCreate(@Args() input: Record<string, any>) {
    try {
      return { order: await this.service.createDraft(input), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['input'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async returnApprove(@Args('id') id: string) {
    try {
      return { return: await this.service.approveReturn(id), userErrors: [] }
    } catch (e) {
      return { return: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async returnDecline(@Args('id') id: string, @Args('reason', { nullable: true }) reason?: string) {
    try {
      return { return: await this.service.declineReturn(id, reason), userErrors: [] }
    } catch (e) {
      return { return: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async returnCancel(@Args('id') id: string) {
    try {
      return { return: await this.service.cancelReturn(id), userErrors: [] }
    } catch (e) {
      return { return: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async draftOrderUpdate(@Args('id') id: string, @Args() input: Record<string, any>) {
    try {
      return { order: await this.service.updateDraft(id, input), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['input'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async draftOrderDelete(@Args('ids') ids: string[]) {
    return { updatedIds: await this.service.deleteDrafts(ids), userErrors: [] }
  }


  @Mutation()
  async draftOrderCreateFromOrder(@Args('orderId') orderId: string) {
    try {
      return { order: await this.service.draftOrderCreateFromOrder(orderId), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['orderId'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async draftOrderDuplicate(@Args('id') id: string) {
    try {
      return { order: await this.service.draftOrderDuplicate(id), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }
  @Mutation()
  async draftOrderConvert(@Args('id') id: string) {
    try {
      return { order: await this.service.convertDraft(id), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async draftOrderInvoiceSend(@Args('id') id: string) {
    try {
      return { order: await this.service.sendInvoice(id), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async draftOrderCalculate(@Args('input') input: Record<string, unknown>) {
    try {
      return { calculatedDraftOrder: await this.service.calculateDraft(input), userErrors: [] }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      return { calculatedDraftOrder: null, userErrors: [{ field: ['input'], message }] }
    }
  }

  @Mutation()
  async abandonedCheckoutRecoverySend(@Args('id') id: string) {
    try {
      return { checkout: await this.service.sendRecoveryEmail(id), userErrors: [] }
    } catch (e) {
      return { checkout: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }

  @Mutation()
  async abandonedCheckoutConvert(@Args('id') id: string) {
    try {
      return { order: await this.service.convertAbandoned(id), userErrors: [] }
    } catch (e) {
      return { order: null, userErrors: [{ field: ['id'], message: (e as Error).message }] }
    }
  }
}
