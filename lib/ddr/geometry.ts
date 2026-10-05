import type { PcbCopperPour, PcbSmtPad } from "circuit-json"
import * as clipping from "polygon-clipping"
import type { DdrPoint } from "./types"

export type CopperGeometry = clipping.MultiPolygon
export const GEOMETRY_EPSILON_MM = 1e-8
const AREA_EPSILON_MM2 = 1e-12
export const distance = (a: DdrPoint, b: DdrPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y)
export const pointAt = (a: DdrPoint, b: DdrPoint, t: number): DdrPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})
const cross = (a: DdrPoint, b: DdrPoint) => a.x * b.y - a.y * b.x
const subtract = (a: DdrPoint, b: DdrPoint) => ({ x: a.x - b.x, y: a.y - b.y })
const pairs = (points: DdrPoint[]): clipping.Ring =>
  points.map((p) => [p.x, p.y])
export const polygon = (points: DdrPoint[]): CopperGeometry => [[pairs(points)]]
export const rectangle = (
  center: DdrPoint,
  width: number,
  height: number,
  rotation = 0,
): CopperGeometry => {
  const theta = (rotation * Math.PI) / 180
  return polygon(
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([sx, sy]) => {
      const x = (sx! * width) / 2
      const y = (sy! * height) / 2
      return {
        x: center.x + x * Math.cos(theta) - y * Math.sin(theta),
        y: center.y + x * Math.sin(theta) + y * Math.cos(theta),
      }
    }),
  )
}
/** Inscribed regular polygon. Contact is conservative: a sub-tolerance missed contact is UNKNOWN upstream. */
export const disk = (center: DdrPoint, radius: number): CopperGeometry =>
  polygon(
    Array.from({ length: 128 }, (_, i) => ({
      x: center.x + radius * Math.cos((i * Math.PI) / 64),
      y: center.y + radius * Math.sin((i * Math.PI) / 64),
    })),
  )
export const annulus = (
  center: DdrPoint,
  outerRadius: number,
  holeRadius: number,
): CopperGeometry => {
  // Circumscribed hole avoids inventing copper at the drilled edge.
  return clipping.difference(
    disk(center, outerRadius),
    disk(center, holeRadius / Math.cos(Math.PI / 128)),
  )
}
export const union = (geometries: CopperGeometry[]): CopperGeometry =>
  geometries.length
    ? clipping.union(geometries[0]!, ...geometries.slice(1))
    : []
export const area = (geometry: CopperGeometry) =>
  geometry.reduce(
    (total, poly) =>
      total +
      poly.reduce((sum, ring, i) => {
        const signed = ring.reduce((a, p, j) => {
          const q = ring[(j + 1) % ring.length]!
          return a + p[0] * q[1] - q[0] * p[1]
        }, 0)
        return sum + (i === 0 ? 1 : -1) * Math.abs(signed / 2)
      }, 0),
    0,
  )
export const hasContact = (a: CopperGeometry, b: CopperGeometry) =>
  area(clipping.intersection(a, b)) > AREA_EPSILON_MM2
export const difference = clipping.difference
export const intersection = clipping.intersection
export const traceStrip = (
  a: DdrPoint,
  b: DdrPoint,
  halfWidth: number,
): CopperGeometry => {
  const length = distance(a, b)
  if (length < GEOMETRY_EPSILON_MM) return disk(a, halfWidth)
  const dx = (-(b.y - a.y) / length) * halfWidth
  const dy = ((b.x - a.x) / length) * halfWidth
  return polygon([
    { x: a.x + dx, y: a.y + dy },
    { x: b.x + dx, y: b.y + dy },
    { x: b.x - dx, y: b.y - dy },
    { x: a.x - dx, y: a.y - dy },
  ])
}
const finitePoints = (points: DdrPoint[]) =>
  points.length >= 3 &&
  points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
export const pourGeometry = (
  pour: PcbCopperPour,
): CopperGeometry | undefined => {
  if (pour.shape === "rect") {
    if (
      ![
        pour.center.x,
        pour.center.y,
        pour.width,
        pour.height,
        pour.rotation ?? 0,
      ].every(Number.isFinite) ||
      pour.width <= 0 ||
      pour.height <= 0
    )
      return
    return rectangle(pour.center, pour.width, pour.height, pour.rotation)
  }
  if (pour.shape === "polygon")
    return finitePoints(pour.points) ? polygon(pour.points) : undefined
  const rings = [pour.brep_shape.outer_ring, ...pour.brep_shape.inner_rings]
  if (
    rings.some(
      (ring) =>
        !finitePoints(ring.vertices) ||
        ring.vertices.some((p) => p.bulge !== undefined && p.bulge !== 0),
    )
  )
    return
  return [[...rings.map((ring) => pairs(ring.vertices))]]
}
export const padGeometry = (pad: PcbSmtPad): CopperGeometry | undefined => {
  if (pad.shape !== "polygon" && ![pad.x, pad.y].every(Number.isFinite)) return
  if (
    pad.shape !== "polygon" &&
    pad.shape !== "circle" &&
    (![pad.width, pad.height].every(Number.isFinite) ||
      pad.width <= 0 ||
      pad.height <= 0)
  )
    return
  if (
    (pad.shape === "rotated_rect" || pad.shape === "rotated_pill") &&
    !Number.isFinite(pad.ccw_rotation)
  )
    return

  if (pad.shape === "polygon")
    return finitePoints(pad.points) ? polygon(pad.points) : undefined
  if (pad.shape === "circle")
    return Number.isFinite(pad.radius) && pad.radius > 0
      ? disk(pad, pad.radius)
      : undefined
  if (pad.shape === "rect" || pad.shape === "rotated_rect")
    return rectangle(
      pad,
      pad.width,
      pad.height,
      pad.shape === "rotated_rect" ? pad.ccw_rotation : 0,
    )
  return undefined // Pill geometry is deliberately unsupported, never replaced by a bounding box.
}
const pointInRing = (point: DdrPoint, ring: clipping.Ring) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (
      a[1] > point.y !== b[1] > point.y &&
      point.x < ((b[0] - a[0]) * (point.y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside
  }
  return inside
}
export const pointInCopper = (point: DdrPoint, geometry: CopperGeometry) =>
  geometry.some(
    (poly) =>
      pointInRing(point, poly[0]!) &&
      !poly.slice(1).some((ring) => pointInRing(point, ring)),
  )
/** Exact interval partition at every straight polygon boundary; no fixed point sampling. */
export const uncoveredIntervals = (
  a: DdrPoint,
  b: DdrPoint,
  geometry: CopperGeometry,
): [number, number][] => {
  const direction = subtract(b, a)
  const cuts = [0, 1]
  for (const poly of geometry)
    for (const ring of poly)
      for (let i = 0; i < ring.length; i++) {
        const c = { x: ring[i]![0], y: ring[i]![1] }
        const d = {
          x: ring[(i + 1) % ring.length]![0],
          y: ring[(i + 1) % ring.length]![1],
        }
        const edge = subtract(d, c)
        const den = cross(direction, edge)
        if (Math.abs(den) < 1e-16) {
          if (Math.abs(cross(subtract(c, a), direction)) < 1e-16) {
            const norm = direction.x ** 2 + direction.y ** 2
            if (norm > 0)
              for (const p of [c, d])
                cuts.push(
                  Math.max(
                    0,
                    Math.min(
                      1,
                      ((p.x - a.x) * direction.x + (p.y - a.y) * direction.y) /
                        norm,
                    ),
                  ),
                )
          }
          continue
        }
        const t = cross(subtract(c, a), edge) / den
        const u = cross(subtract(c, a), direction) / den
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) cuts.push(t)
      }
  cuts.sort((x, y) => x - y)
  const gaps: [number, number][] = []
  for (let i = 1; i < cuts.length; i++) {
    const start = cuts[i - 1]!
    const end = cuts[i]!
    if ((end - start) * distance(a, b) <= GEOMETRY_EPSILON_MM) continue
    if (!pointInCopper(pointAt(a, b, (start + end) / 2), geometry)) {
      const previous = gaps[gaps.length - 1]
      if (previous && Math.abs(previous[1] - start) < 1e-12) previous[1] = end
      else gaps.push([start, end])
    }
  }
  return gaps
}
/** Distance to all actual fill boundaries, including holes. This is a local clearance metric, not a neck/inductance solver. */
export const segmentCopperClearance = (
  a: DdrPoint,
  b: DdrPoint,
  geometry: CopperGeometry,
): number => {
  const pointSegmentDistance = (p: DdrPoint, c: DdrPoint, d: DdrPoint) => {
    const length2 = distance(c, d) ** 2
    const t =
      length2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((p.x - c.x) * (d.x - c.x) + (p.y - c.y) * (d.y - c.y)) / length2,
            ),
          )
    return distance(p, pointAt(c, d, t))
  }
  let minimum = Infinity
  for (const poly of geometry)
    for (const ring of poly)
      for (let i = 0; i < ring.length; i++) {
        const c = { x: ring[i]![0], y: ring[i]![1] }
        const d = {
          x: ring[(i + 1) % ring.length]![0],
          y: ring[(i + 1) % ring.length]![1],
        }
        minimum = Math.min(
          minimum,
          pointSegmentDistance(a, c, d),
          pointSegmentDistance(b, c, d),
          pointSegmentDistance(c, a, b),
          pointSegmentDistance(d, a, b),
        )
      }
  return minimum
}
/** Exact radial overlap against straight filled polygons with holes, including annulus-to-thermal contact. */
export const annulusContact = (
  center: DdrPoint,
  outerRadius: number,
  holeRadius: number,
  geometry: CopperGeometry,
): boolean | "marginal" => {
  let marginal = false
  for (const poly of geometry) {
    let minimum = pointInCopper(center, [poly]) ? 0 : Infinity
    let maximum = 0
    for (const ring of poly)
      for (let i = 0; i < ring.length; i++) {
        const a = { x: ring[i]![0], y: ring[i]![1] }
        const b = {
          x: ring[(i + 1) % ring.length]![0],
          y: ring[(i + 1) % ring.length]![1],
        }
        const length2 = distance(a, b) ** 2
        const t =
          length2 === 0
            ? 0
            : Math.max(
                0,
                Math.min(
                  1,
                  ((center.x - a.x) * (b.x - a.x) +
                    (center.y - a.y) * (b.y - a.y)) /
                    length2,
                ),
              )
        minimum = Math.min(minimum, distance(center, pointAt(a, b, t)))
        maximum = Math.max(maximum, distance(center, a))
      }
    if (
      minimum < outerRadius - GEOMETRY_EPSILON_MM &&
      maximum > holeRadius + GEOMETRY_EPSILON_MM
    )
      return true
    if (
      minimum <= outerRadius + GEOMETRY_EPSILON_MM &&
      maximum >= holeRadius - GEOMETRY_EPSILON_MM
    )
      marginal = true
  }
  return marginal ? "marginal" : false
}
