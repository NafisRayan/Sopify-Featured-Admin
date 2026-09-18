import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { PrismaModule } from '../prisma/prisma.module'
import { AuthController } from './auth.controller'
import { AuthMiddleware } from './auth.middleware'
import { AuthorizationService } from './authorization.service'
import { GqlAuthzInterceptor } from './gql-authz.interceptor'
import { SessionService } from './session.service'

@Module({
  imports: [PrismaModule],
  providers: [
    SessionService,
    AuthMiddleware,
    AuthorizationService,
    { provide: APP_INTERCEPTOR, useClass: GqlAuthzInterceptor },
  ],
  controllers: [AuthController],
  exports: [SessionService, AuthorizationService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes('*')
  }
}
