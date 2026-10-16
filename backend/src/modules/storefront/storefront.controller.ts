import { Controller, Post, Get, Req, Res, HttpStatus } from '@nestjs/common'
import type { Request, Response } from 'express'
import { StorefrontService } from './storefront.service'

@Controller('api/storefront')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Get('graphql')
  handleGet(@Res() res: Response) {
    res.type('html').send(`
      <!DOCTYPE html>
      <html>
        <head><title>Shopify Storefront GraphQL API</title></head>
        <body style="font-family: sans-serif; padding: 2rem;">
          <h2>Shopify Storefront GraphQL API (2024-10 / 2026-10)</h2>
          <p>Send POST requests with <code>{ "query": "..." }</code> to this endpoint.</p>
        </body>
      </html>
    `)
  }

  @Post('graphql')
  async handleQuery(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { query, variables, operationName } = (req.body || {}) as {
      query?: string
      variables?: Record<string, unknown>
      operationName?: string
    }

    if (!query) {
      res.status(HttpStatus.BAD_REQUEST).json({
        errors: [{ message: 'GraphQL query is required in request body.' }],
      })
      return
    }

    const result = await this.storefrontService.execute(query, variables, operationName)
    res.status(HttpStatus.OK).json(result)
  }
}
