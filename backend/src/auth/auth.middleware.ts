import { Injectable, NestMiddleware } from '@nestjs/common'
import type { Request, Response, NextFunction } from 'express'
import { authDisabled } from './auth.config'
import { SessionService, type StaffSession } from './session.service'
import { staffContext } from './staff-context'

declare module 'express-serve-static-core' {
  interface Request {
    staff?: StaffSession
  }
}

function isPublicPath(req: Request): boolean {
  if (req.method === 'OPTIONS') return true
  if (req.path.startsWith('/auth/login') && req.method === 'POST') return true
  if (req.path.startsWith('/auth/logout') && req.method === 'POST') return true
  return false
}

function requiresAuth(req: Request): boolean {
  if (req.method === 'OPTIONS') return false
  if (req.path === '/graphql') return true
  if (req.path === '/uploads' && req.method === 'POST') return true
  return false
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly sessions: SessionService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (authDisabled() || isPublicPath(req) || !requiresAuth(req)) {
      next()
      return
    }

    const staff = await this.sessions.staffFromRequest(req)
    if (!staff) {
      res.status(401).json({ statusCode: 401, message: 'Staff session required' })
      return
    }
    ;(req as Request & { staff?: StaffSession }).staff = staff
    staffContext.run(staff, () => next())
  }
}
