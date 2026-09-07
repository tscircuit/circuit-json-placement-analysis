import {
  boundsAreaOverlap,
  distance,
  pointToBoundsDistance,
} from "@tscircuit/math-utils"
import type { PlacementAreaBounds } from "./types"

export type CourtyardShape = {
  bounds: PlacementAreaBounds
  circle?: { x: number; y: number; radius: number }
  orientedRect?: {
    x: number
    y: number
    width: number
    height: number
    ccwRotation: number
  }
}

const GEOMETRY_EPSILON = 1e-6

const toBounds = (b: PlacementAreaBounds) => ({
  minX: b.min_x,
  maxX: b.max_x,
  minY: b.min_y,
  maxY: b.max_y,
})

// Require positive overlap; touching shapes are not collisions.
export const shapesOverlap = (
  a: CourtyardShape,
  b: CourtyardShape,
): boolean => {
  if (boundsAreaOverlap(toBounds(a.bounds), toBounds(b.bounds)) === 0)
    return false

  if (a.circle && b.circle) {
    return (
      distance(a.circle, b.circle) <
      a.circle.radius + b.circle.radius - GEOMETRY_EPSILON
    )
  }

  const circle = a.circle ?? b.circle
  if (!circle) return true

  const other = a.circle ? b : a
  const rect = other.orientedRect
  let x = circle.x
  let y = circle.y
  let bounds = toBounds(other.bounds)

  if (rect) {
    // Undo the rectangle's world CCW rotation around its own center.
    const angle = (rect.ccwRotation * Math.PI) / 180
    const dx = circle.x - rect.x
    const dy = circle.y - rect.y
    x = dx * Math.cos(angle) + dy * Math.sin(angle)
    y = -dx * Math.sin(angle) + dy * Math.cos(angle)
    bounds = {
      minX: -rect.width / 2,
      maxX: rect.width / 2,
      minY: -rect.height / 2,
      maxY: rect.height / 2,
    }
  }

  return (
    pointToBoundsDistance({ x, y }, bounds) < circle.radius - GEOMETRY_EPSILON
  )
}
