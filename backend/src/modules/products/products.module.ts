import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { ProductsResolver } from './products.resolver'
import { ProductsService } from './products.service'
import { ReviewsService } from './reviews.service'

@Module({
  imports: [PrismaModule],
  providers: [ProductsResolver, ProductsService, ReviewsService],
  exports: [ProductsService, ReviewsService],
})
export class ProductsModule {}
