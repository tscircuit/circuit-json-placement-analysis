export type Circle = { x: number; y: number; radius: number }
export type PadBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  circle?: Circle
}

export const getSmtPadCircle = (
  element: Record<string, unknown>,
): Circle | undefined => {
  if (element.type !== "pcb_smtpad" || element.shape !== "circle") return
  const { x, y, radius } = element
  if (
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    typeof y !== "number" ||
    !Number.isFinite(y) ||
    typeof radius !== "number" ||
    !Number.isFinite(radius) ||
    radius <= 0
  )
    return
  return { x, y, radius }
}

// Signed separation: negative means penetration, positive means a gap.
export const getCircleClearance = (
  circle: Circle,
  other: PadBounds,
): number => {
  if (other.circle) {
    return (
      Math.hypot(circle.x - other.circle.x, circle.y - other.circle.y) -
      circle.radius -
      other.circle.radius
    )
  }
  const dx = Math.max(other.minX - circle.x, 0, circle.x - other.maxX)
  const dy = Math.max(other.minY - circle.y, 0, circle.y - other.maxY)
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy) - circle.radius
  // The circle center is inside the rectangle; account for the nearest edge.
  return (
    -circle.radius -
    Math.min(
      circle.x - other.minX,
      other.maxX - circle.x,
      circle.y - other.minY,
      other.maxY - circle.y,
    )
  )
}
