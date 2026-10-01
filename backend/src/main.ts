import 'reflect-metadata'
import { NestFactory, HttpAdapterHost } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { join } from 'node:path'
import { Logger, ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'
import { assertAuthConfig } from './auth/auth.config'
import { AllExceptionsFilter } from './common/all-exceptions.filter'

async function bootstrap(): Promise<void> {
  assertAuthConfig()
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5199')
    .split(',')
    .map((s) => s.trim())
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else if (/^http:\/\/localhost:\d+$/.test(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
  })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)))
  app.enableShutdownHooks()
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' })
  const port = Number(process.env.PORT ?? 4000)
  await app.listen(port)
  new Logger('Bootstrap').log(`GraphQL ready at http://localhost:${port}/graphql`)
}

void bootstrap()
