import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { ProductsModule } from '../products/products.module'
import { StorefrontController } from './storefront.controller'
import { StorefrontService } from './storefront.service'
@Module({
  imports: [PrismaModule, ProductsModule],
  providers: [StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
