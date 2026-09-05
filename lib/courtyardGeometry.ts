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

/**
 * Test positive-area intersection of validated shapes in millimetres.
 * Circle pairs and circle/rectangle pairs use their actual geometry. Shapes
 * without circle metadata retain the report's conservative bounds test.
 * Layer filtering and bounds-based clearance estimates belong to the caller.
 */
export const shapesOverlap = (
  a: CourtyardShape,
  b: CourtyardShape,
): boolean => {
  if (
    Math.min(a.bounds.max_x, b.bounds.max_x) <=
      Math.max(a.bounds.min_x, b.bounds.min_x) ||
    Math.min(a.bounds.max_y, b.bounds.max_y) <=
      Math.max(a.bounds.min_y, b.bounds.min_y)
  ) {
    return false
  }

  if (a.circle && b.circle) {
    return (
      Math.hypot(a.circle.x - b.circle.x, a.circle.y - b.circle.y) <
      a.circle.radius + b.circle.radius - GEOMETRY_EPSILON
    )
  }

  const circle = a.circle ?? b.circle
  if (!circle) return true

  const other = a.circle ? b : a
  const rect = other.orientedRect
  let x = circle.x
  let y = circle.y
  let minX = other.bounds.min_x
  let maxX = other.bounds.max_x
  let minY = other.bounds.min_y
  let maxY = other.bounds.max_y

  if (rect) {
    // Undo the rectangle's world CCW rotation around its own center.
    const angle = (rect.ccwRotation * Math.PI) / 180
    const dx = circle.x - rect.x
    const dy = circle.y - rect.y
    x = dx * Math.cos(angle) + dy * Math.sin(angle)
    y = -dx * Math.sin(angle) + dy * Math.cos(angle)
    minX = -rect.width / 2
    maxX = rect.width / 2
    minY = -rect.height / 2
    maxY = rect.height / 2
  }

  const closestX = Math.max(minX, Math.min(x, maxX))
  const closestY = Math.max(minY, Math.min(y, maxY))
  return (
    Math.hypot(x - closestX, y - closestY) < circle.radius - GEOMETRY_EPSILON
  )
}
