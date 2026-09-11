import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { join } from 'node:path'
import { ValidationPipe, Logger } from '@nestjs/common'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/all-exceptions.filter'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.useGlobalFilters(new AllExceptionsFilter())
  app.enableShutdownHooks()
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' })
  const port = Number(process.env.PORT ?? 4000)
  await app.listen(port)
  new Logger('Bootstrap').log(`GraphQL ready at http://localhost:${port}/graphql`)
}

void bootstrap()
