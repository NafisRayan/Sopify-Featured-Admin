import { Module } from '@nestjs/common'
import { GraphQLModule } from '@nestjs/graphql'
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo'
import { ConfigModule } from '@nestjs/config'
import { join } from 'node:path'
import { PrismaModule } from './prisma/prisma.module'
import { ProductsModule } from './modules/products/products.module'
import { OrdersModule } from './modules/orders/orders.module'
import { CustomersModule } from './modules/customers/customers.module'
import { InventoryModule } from './modules/inventory/inventory.module'
import { CommerceModule } from './modules/commerce/commerce.module'
import { FinancesModule } from './modules/finances/finances.module'
import { StoreContentModule } from './modules/store-content/store-content.module'
import { UploadsModule } from './modules/uploads/uploads.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      typePaths: ['./src/graphql/schema/**/*.graphql'],
      resolvers: { DateTime: require('graphql-scalars').DateTimeResolver, JSON: require('graphql-scalars').JSONResolver },
      playground: true,
      sortSchema: false,
      introspection: true,
    }),
    PrismaModule,
    ProductsModule,
    OrdersModule,
    CustomersModule,
    InventoryModule,
    CommerceModule,
    FinancesModule,
    StoreContentModule,
    UploadsModule,
  ],
})
export class AppModule {}
