import { Injectable } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { authDisabled } from './auth.config'

export interface StaffSession {
  id: string
  name: string
  email: string
  role: string
}

export const SESSION_COOKIE = 'ns_staff_session'
const MAX_AGE_SEC = 60 * 60 * 24 * 7

@Injectable()
export class SessionService {
  constructor(private prisma: PrismaService) {}

  private secret(): string {
    const secret = process.env.SESSION_SECRET?.trim()
    if (secret) return secret
    if (authDisabled()) return 'auth-disabled-dev-only-not-for-production'
    throw new Error('SESSION_SECRET not configured')
  }

  sign(staffId: string, expiresAt: number): string {
    const payload = `${staffId}.${expiresAt}`
    const sig = createHmac('sha256', this.secret()).update(payload).digest('base64url')
    return `${payload}.${sig}`
  }

  verify(token: string): { staffId: string; expiresAt: number } | null {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [staffId, expStr, sig] = parts
    const expiresAt = Number(expStr)
    if (!staffId || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return null
    const expected = createHmac('sha256', this.secret()).update(`${staffId}.${expiresAt}`).digest('base64url')
    try {
      if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    } catch {
      return null
    }
    return { staffId, expiresAt }
  }

  cookieHeader(staffId: string): string {
    const expiresAt = Date.now() + MAX_AGE_SEC * 1000
    const token = this.sign(staffId, expiresAt)
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
    return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE_SEC}${secure}`
  }

  clearCookieHeader(): string {
    return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
  }

  parseCookie(header: string | undefined): string | null {
    if (!header) return null
    for (const part of header.split(';')) {
      const [k, ...v] = part.trim().split('=')
      if (k === SESSION_COOKIE) return v.join('=')
    }
    return null
  }

  async staffFromRequest(req: { headers?: { cookie?: string } }): Promise<StaffSession | null> {
    const token = this.parseCookie(req.headers?.cookie)
    if (!token) return null
    const parsed = this.verify(token)
    if (!parsed) return null
    const member = await this.prisma.staffMember.findUnique({ where: { id: parsed.staffId } })
    if (!member || member.status !== 'active') return null
    return { id: member.id, name: member.name, email: member.email, role: member.role }
  }
}
