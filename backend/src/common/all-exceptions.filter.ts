import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common'
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core'

/** Log server errors before Nest formats the response. */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter)
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    // GraphQL requests must surface errors through Apollo, not an HTTP reply —
    // BaseExceptionFilter cannot write to a GraphQL context response.
    if ((host.getType() as string) === 'graphql') {
      if (!(exception instanceof HttpException) || exception.getStatus() >= 500) {
        console.error('[Unhandled:gql]', exception)
      }
      throw exception
    }
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    if (status >= 500) {
      // logged centrally; GraphQL surfaces userErrors for expected failures
      console.error('[Unhandled]', exception)
    }
    super.catch(exception, host)
  }
}
