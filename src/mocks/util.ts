import type { LatLng } from './types'

/** Small, fast, seedable PRNG (mulberry32). Returns a function producing floats in [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)]
  if (item === undefined) throw new Error('pick() from empty list')
  return item
}

export function between(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function round(value: number, dp = 2): number {
  const f = 10 ** dp
  return Math.round(value * f) / f
}

/** Move `current` toward `target` by at most `maxStep`. */
export function approach(current: number, target: number, maxStep: number): number {
  if (Math.abs(target - current) <= maxStep) return target
  return current + Math.sign(target - current) * maxStep
}

let counter = 0
export function makeId(prefix: string): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36).padStart(4, '0')}`
}

// --- Geography -------------------------------------------------------------------------------

const EARTH_RADIUS_M = 6_371_000
const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Great-circle distance in metres. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/** Initial bearing from a to b, degrees 0–360 (0 = north). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat))
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng))
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Point `meters` away from `from` along `bearing`. Flat-earth approximation; fine at site scale. */
export function offsetM(from: LatLng, bearing: number, meters: number): LatLng {
  const dNorth = Math.cos(toRad(bearing)) * meters
  const dEast = Math.sin(toRad(bearing)) * meters
  return {
    lat: from.lat + toDeg(dNorth / EARTH_RADIUS_M),
    lng: from.lng + toDeg(dEast / (EARTH_RADIUS_M * Math.cos(toRad(from.lat)))),
  }
}

/** Smallest signed difference between two headings, degrees in (-180, 180]. */
export function headingDelta(from: number, to: number): number {
  const d = ((((to - from) % 360) + 540) % 360) - 180
  return d === -180 ? 180 : d
}
