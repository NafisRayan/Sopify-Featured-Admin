import { Module, forwardRef } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { StorefrontModule } from '../storefront/storefront.module'
import { OrdersModule } from '../orders/orders.module'
import { PaymentsService } from './payments.service'
import { PaymentsController } from './payments.controller'

@Module({
  imports: [PrismaModule, StorefrontModule, forwardRef(() => OrdersModule)],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
