import type { PlacementAreaBounds } from "./types"

type PcbPoint = { x: number; y: number }

const isFinitePoint = (point: unknown): point is PcbPoint =>
  typeof point === "object" &&
  point !== null &&
  "x" in point &&
  "y" in point &&
  typeof point.x === "number" &&
  Number.isFinite(point.x) &&
  typeof point.y === "number" &&
  Number.isFinite(point.y)

/** Axis-aligned board extents in PCB coordinates (mm, +X right, +Y up).
 * Circuit JSON outline points already include translation; board.center is
 * the board's placement origin and need not be the outline's bounding center.
 */
export const getBoardBounds = (
  board: Record<string, unknown> | undefined,
): PlacementAreaBounds | null => {
  const outline = board?.outline
  if (
    Array.isArray(outline) &&
    outline.length >= 3 &&
    outline.every(isFinitePoint)
  ) {
    const min_x = Math.min(...outline.map((point) => point.x))
    const max_x = Math.max(...outline.map((point) => point.x))
    const min_y = Math.min(...outline.map((point) => point.y))
    const max_y = Math.max(...outline.map((point) => point.y))
    if (max_x > min_x && max_y > min_y) {
      return {
        min_x,
        max_x,
        min_y,
        max_y,
        width: max_x - min_x,
        height: max_y - min_y,
      }
    }
  }

  const center = board?.center
  const width = board?.width
  const height = board?.height
  if (
    !isFinitePoint(center) ||
    typeof width !== "number" ||
    !Number.isFinite(width) ||
    typeof height !== "number" ||
    !Number.isFinite(height)
  ) {
    return null
  }
  return {
    min_x: center.x - width / 2,
    max_x: center.x + width / 2,
    min_y: center.y - height / 2,
    max_y: center.y + height / 2,
    width,
    height,
  }
}
