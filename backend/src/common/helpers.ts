import { Prisma } from '@prisma/client'
/** Shared GraphQL payload helpers (Shopify userErrors pattern) */

export interface UserError {
  field: string[]
  message: string
}

export function userError(field: string, message: string): UserError {
  return { field: [field], message }
}

/** Offset-free cursor encoding (opaque, Shopify-style) */
export function encodeCursor(index: number): string {
  return Buffer.from(`cursor:${index}`).toString('base64')
}

export function decodeCursor(cursor: string | undefined | null): number {
  if (!cursor) return -1
  const raw = Buffer.from(cursor, 'base64').toString('utf8')
  const n = Number(raw.replace('cursor:', ''))
  return Number.isFinite(n) ? n : -1
}

export interface Connection<T> {
  edges: { cursor: string; node: T }[]
  pageInfo: {
    hasNextPage: boolean
    hasPreviousPage: boolean
    startCursor: string | null
    endCursor: string | null
  }
  totalCount: number
}

export function toConnection<T>(
  rows: T[],
  first?: number | null,
  after?: string | null,
  last?: number | null,
  before?: string | null,
): Connection<T> {
  let start = 0
  let end = rows.length

  if (after) {
    const afterIdx = decodeCursor(after)
    if (afterIdx >= 0) {
      start = Math.min(rows.length, afterIdx + 1)
    }
  }

  if (before) {
    const beforeIdx = decodeCursor(before)
    if (beforeIdx >= 0) {
      end = Math.max(0, Math.min(rows.length, beforeIdx))
    }
  }

  let slice: { cursor: string; node: T }[] = []
  let hasNextPage = false
  let hasPreviousPage = false

  // When both are present (e.g. schema default first: 25 alongside explicit last: N), last takes precedence
  if (last != null && last >= 0) {
    const count = last
    const available = Math.max(0, end - start)
    const take = Math.min(available, count)
    const actualStart = end - take
    const sub = rows.slice(actualStart, end)
    slice = sub.map((node, i) => ({ cursor: encodeCursor(actualStart + i), node }))
    hasPreviousPage = actualStart > start || start > 0
    hasNextPage = end < rows.length
  } else {
    const count = first != null && first >= 0 ? first : 25
    const available = Math.max(0, end - start)
    const take = Math.min(available, count)
    const sub = rows.slice(start, start + take)
    slice = sub.map((node, i) => ({ cursor: encodeCursor(start + i), node }))
    hasNextPage = start + take < end || end < rows.length
    hasPreviousPage = start > 0
  }

  const startCursor = slice.length > 0 ? slice[0].cursor : null
  const endCursor = slice.length > 0 ? slice[slice.length - 1].cursor : null

  return {
    edges: slice,
    pageInfo: {
      hasNextPage,
      hasPreviousPage,
      startCursor,
      endCursor,
    },
    totalCount: rows.length,
  }
}

/** Case-insensitive contains across a set of string fields (Shopify `query:` param) */
export function filterByQuery<T>(rows: T[], query: string | undefined, fields: (row: T) => (string | undefined)[]): T[] {
  if (!query?.trim()) return rows
  const tokens = query.trim().toLowerCase().split(/\s+/)
  return rows.filter((row) =>
    tokens.every((token) => fields(row).some((f) => f?.toLowerCase().includes(token))),
  )
}

/** JSON column helpers — Postgres native JSON (values arrive as objects) */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  if (typeof value !== 'string') return value as unknown as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function toJson(value: unknown): any {
  if (value === null || value === undefined) return Prisma.DbNull
  return value
}
