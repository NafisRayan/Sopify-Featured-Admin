import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { Observable } from 'rxjs'
import { AuthorizationService } from './authorization.service'
import type { StaffSession } from './session.service'

@Injectable()
export class GqlAuthzInterceptor implements NestInterceptor {
  constructor(private readonly authz: AuthorizationService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const gql = GqlExecutionContext.create(context)
    const info = gql.getInfo()
    if (info.parentType?.name !== 'Mutation') return next.handle()

    const ctx = gql.getContext() as { staff?: StaffSession | null }
    const staff = ctx.staff ?? null
    const fieldName = info.fieldName as string

    return new Observable((subscriber) => {
      void this.authz
        .assertMutationAllowed(staff, fieldName)
        .then(() => {
          next.handle().subscribe(subscriber)
        })
        .catch((err) => subscriber.error(err))
    })
  }
}
