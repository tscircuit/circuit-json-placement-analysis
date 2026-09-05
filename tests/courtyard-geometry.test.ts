import { expect, test } from "bun:test"
import { shapesOverlap, type CourtyardShape } from "../lib/courtyardGeometry"

const bounds = (x: number, y: number, width: number, height: number) => ({
  min_x: x - width / 2,
  max_x: x + width / 2,
  min_y: y - height / 2,
  max_y: y + height / 2,
  width,
  height,
})

const circle = (x: number, y: number, radius: number): CourtyardShape => ({
  bounds: bounds(x, y, radius * 2, radius * 2),
  circle: { x, y, radius },
})

const rectangle = (
  x: number,
  y: number,
  width: number,
  height: number,
  ccwRotation = 0,
): CourtyardShape => {
  const radians = (ccwRotation * Math.PI) / 180
  const worldWidth =
    Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians))
  const worldHeight =
    Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))
  return {
    bounds: bounds(x, y, worldWidth, worldHeight),
    orientedRect: { x, y, width, height, ccwRotation },
  }
}

const expectSymmetric = (
  a: CourtyardShape,
  b: CourtyardShape,
  expected: boolean,
) => {
  expect(shapesOverlap(a, b)).toBe(expected)
  expect(shapesOverlap(b, a)).toBe(expected)
}

test("circle intersection distinguishes overlap, separation, and tangency", () => {
  expectSymmetric(circle(0, 0, 2), circle(3, 0, 2), true)
  expectSymmetric(circle(0, 0, 2), circle(5, 0, 2), false)
  expectSymmetric(circle(0, 0, 2), circle(4, 0, 2), false)
})

test("diagonal circles can have overlapping bounds without intersecting", () => {
  expectSymmetric(circle(0, 0, 2), circle(3, 3, 2), false)
})

test("circle intersection respects the 1e-6 mm tolerance", () => {
  expectSymmetric(circle(0, 0, 2), circle(4 - 0.5e-6, 0, 2), false)
  expectSymmetric(circle(0, 0, 2), circle(4 - 2e-6, 0, 2), true)
})

test("circle containment and coincident centers intersect", () => {
  expectSymmetric(circle(0, 0, 2), circle(0, 0, 0.2), true)
  expectSymmetric(circle(0, 0, 2), circle(1, 0, 0.2), true)
})

test("axis-aligned rectangle intersection excludes empty circle corners", () => {
  expectSymmetric(circle(0, 0, 2), rectangle(1.5, 0, 0.5, 0.5), true)
  expectSymmetric(circle(0, 0, 2), rectangle(2, 2, 0.5, 0.5), false)
  expectSymmetric(circle(0, 0, 2), rectangle(2.5, 0, 1, 1), false)
})

test("circle inside rectangle intersects even far from the edges", () => {
  expectSymmetric(circle(10, -7, 0.2), rectangle(10, -7, 4, 4, 45), true)
})

test("45 degree rectangle rejects a circle in its empty AABB corner", () => {
  expectSymmetric(circle(0, 0, 0.2), rectangle(1, -1, 4, 0.2, 45), false)
})

test("45 degree rectangle detects true overlap", () => {
  expectSymmetric(circle(0, 0, 0.2), rectangle(0.5, 0.5, 4, 0.2, 45), true)
})

test("inverse rotation uses the rectangle center and CCW direction", () => {
  expectSymmetric(circle(10, 11, 0.2), rectangle(10, 10, 4, 0.2, 90), true)
  expectSymmetric(circle(11, 10, 0.2), rectangle(10, 10, 4, 0.2, 90), false)
  expectSymmetric(circle(0, 0, 0.2), rectangle(0.5, -0.5, 4, 0.2, -45), true)
})

test("bounds-only shapes retain conservative fallback and strict tangency", () => {
  const a = { bounds: bounds(0, 0, 2, 2) }
  expectSymmetric(a, { bounds: bounds(1, 1, 2, 2) }, true)
  expectSymmetric(a, { bounds: bounds(2, 0, 2, 2) }, false)
  expectSymmetric(circle(0, 0, 2), { bounds: bounds(2, 2, 0.5, 0.5) }, false)
})
