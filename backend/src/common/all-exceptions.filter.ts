import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common'
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core'

/** Log server errors before Nest formats the response. */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter)
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    if (status >= 500) {
      // logged centrally; GraphQL surfaces userErrors for expected failures
      console.error('[Unhandled]', exception)
    }
    super.catch(exception, host)
  }
}
