// Deterministic PRNG utilities for the one-time seed generators
// (frontend/scripts/generate/**). Not used by the app runtime.

/** mulberry32 — small, fast, deterministic 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Seeded RNG helper with pick/int/float/chance helpers. */
export class Rng {
  private next: () => number

  constructor(seed: number) {
    this.next = mulberry32(seed)
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  float(min: number, max: number, decimals = 2): number {
    const v = this.next() * (max - min) + min
    const f = 10 ** decimals
    return Math.round(v * f) / f
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)]!
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  /** Weighted pick: entries are [value, weight] pairs; weights need not sum to 1. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, w]) => sum + w, 0)
    let roll = this.next() * total
    for (const [value, w] of entries) {
      roll -= w
      if (roll <= 0) return value
    }
    return entries[entries.length - 1]![0]
  }

  /** n unique picks (or fewer when the list is smaller). */
  sample<T>(list: readonly T[], n: number): T[] {
    const pool = [...list]
    const out: T[] = []
    while (out.length < n && pool.length > 0) {
      out.push(...pool.splice(Math.floor(this.next() * pool.length), 1))
    }
    return out
  }

  /** Random date between two dates. */
  dateBetween(from: Date, to: Date): Date {
    const span = Math.max(0, to.getTime() - from.getTime())
    return new Date(from.getTime() + this.next() * span)
  }

  /** Date within the last `days` days (or the next `days` when future=true). */
  dateWithin(days: number, future = false): Date {
    const offset = this.next() * days * 86400000
    return new Date(Date.now() + (future ? offset : -offset))
  }
}
