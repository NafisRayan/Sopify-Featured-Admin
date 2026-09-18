import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { PrismaService } from '../prisma/prisma.service'
import { verifyPassword } from './password.util'
import { SessionService } from './session.service'

const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const LOGIN_MAX = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000

function pruneExpiredLoginAttempts(now: number): void {
  for (const [k, e] of loginAttempts) {
    if (now > e.resetAt) loginAttempts.delete(k)
  }
}

function assertLoginRateLimit(key: string): void {
  const now = Date.now()
  if (loginAttempts.size > 500) pruneExpiredLoginAttempts(now)
  const entry = loginAttempts.get(key) ?? { count: 0, resetAt: now + LOGIN_WINDOW_MS }
  if (now > entry.resetAt) {
    entry.count = 0
    entry.resetAt = now + LOGIN_WINDOW_MS
  }
  entry.count += 1
  loginAttempts.set(key, entry)
  if (entry.count > LOGIN_MAX) {
    throw new HttpException('Too many login attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS)
  }
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  async login(
    @Body() body: { email?: string; password?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = body.email?.trim().toLowerCase()
    const password = body.password ?? ''
    if (!email || !password) throw new BadRequestException('Email and password are required')
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown'
    assertLoginRateLimit(`${ip}:${email}`)
    const member = await this.prisma.staffMember.findUnique({ where: { email } })
    if (!member || member.status !== 'active' || !verifyPassword(password, member.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password')
    }
    res.setHeader('Set-Cookie', this.sessions.cookieHeader(member.id))
    await this.prisma.staffMember.update({ where: { id: member.id }, data: { lastActiveAt: new Date() } })
    return {
      staff: { id: member.id, name: member.name, email: member.email, role: member.role },
    }
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Set-Cookie', this.sessions.clearCookieHeader())
    return { ok: true }
  }

  @Get('me')
  async me(@Req() req: Request) {
    const staff = await this.sessions.staffFromRequest(req)
    if (!staff) throw new UnauthorizedException('Staff session required')
    return { staff }
  }
}
