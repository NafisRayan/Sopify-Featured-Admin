import { ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { parseJson } from '../common/helpers'
import { authDisabled } from './auth.config'
import { MUTATION_PERMISSIONS, type PermissionResource } from './mutation-permissions'
import type { StaffSession } from './session.service'

@Injectable()
export class AuthorizationService {
  constructor(private prisma: PrismaService) {}

  async assertMutationAllowed(staff: StaffSession | null | undefined, fieldName: string): Promise<void> {
    if (authDisabled()) return
    if (!staff) throw new ForbiddenException('Staff session required')

    const spec = MUTATION_PERMISSIONS[fieldName]
    if (!spec) {
      throw new ForbiddenException(`Mutation ${fieldName} is not authorized (missing permission map entry)`)
    }

    if (spec === 'owner') {
      if (staff.role !== 'owner') throw new ForbiddenException('Store owner access required')
      return
    }

    await this.assertCan(staff, spec.resource, spec.action)
  }

  async assertCan(staff: StaffSession, resource: PermissionResource, action: string): Promise<void> {
    if (authDisabled()) return
    if (staff.role === 'owner') return

    const member = await this.prisma.staffMember.findUnique({ where: { id: staff.id } })
    if (!member || member.status !== 'active') throw new ForbiddenException('Staff account inactive')

    const permissions = parseJson<Record<string, string[]>>(member.permissions as string, {})
    const allowed = permissions[resource] ?? []
    if (!allowed.includes(action)) {
      throw new ForbiddenException(`Missing ${resource}:${action} permission`)
    }
  }

  async assertStaffUpdateAllowed(
    caller: StaffSession | null | undefined,
    targetId: string,
    input: { role?: string },
  ): Promise<void> {
    if (authDisabled()) return
    if (!caller) throw new ForbiddenException('Staff session required')
    if (caller.role !== 'owner') throw new ForbiddenException('Store owner access required')

    const target = await this.prisma.staffMember.findUnique({ where: { id: targetId } })
    if (!target) throw new Error('Staff member not found')
    if (target.role === 'owner' && input.role !== undefined && input.role !== 'owner') {
      throw new ForbiddenException('The store owner role cannot be changed')
    }
    if (input.role === 'owner' && caller.id !== targetId) {
      throw new ForbiddenException('Only the current owner can transfer ownership')
    }
  }
}
