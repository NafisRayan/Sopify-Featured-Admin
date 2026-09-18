import { currentStaff } from './staff-context'

export function actorName(): string {
  return currentStaff()?.name ?? 'System'
}

export function actorId(): string {
  return currentStaff()?.id ?? 'system'
}
