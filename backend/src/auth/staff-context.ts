import { AsyncLocalStorage } from 'node:async_hooks'
import type { StaffSession } from './session.service'

export const staffContext = new AsyncLocalStorage<StaffSession>()

export function currentStaff(): StaffSession | null {
  return staffContext.getStore() ?? null
}
