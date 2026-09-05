import { expect, test } from "bun:test"
import { analyzeAllPlacements } from "../lib/index"

type Circuit = Parameters<typeof analyzeAllPlacements>[0]
type CircuitElement = Circuit[number]

const circle = (x: number, y: number, radius = 2): CircuitElement => ({
  type: "pcb_courtyard_circle",
  center: { x, y },
  radius,
  layer: "top",
})

// No cached DRC records: the report must discover collisions from geometry.
const fixture = (
  first: CircuitElement = circle(0, 0),
  second: CircuitElement = circle(3, 0),
): Circuit => [
  { type: "pcb_board", center: { x: 0, y: 0 }, width: 20, height: 20 },
  ...[1, 2].flatMap(
    (i): Circuit => [
      {
        type: "source_component",
        source_component_id: `source_component_${i}`,
        name: `R${i}`,
        ftype: "simple_resistor",
      },
      {
        type: "pcb_component",
        source_component_id: `source_component_${i}`,
        pcb_component_id: `pcb_component_${i}`,
        center: { x: (i - 1) * 3, y: 0 },
        width: 0.4,
        height: 0.4,
        layer: "top",
      },
    ],
  ),
  { ...first, pcb_component_id: "pcb_component_1" },
  { ...second, pcb_component_id: "pcb_component_2" },
]

const collisions = (data: Circuit) =>
  analyzeAllPlacements(data)
    .getIssues()
    .filter((issue) => issue.type === "courtyard_collision")

test("circular courtyards produce report issues without cached DRC errors", () => {
  const analysis = analyzeAllPlacements(fixture())
  const report = analysis.getReport()
  expect(analysis.getString()).toContain(
    "placement summary: 1 courtyard collision",
  )
  expect(report.issues).toHaveLength(1)
  expect(report.issues[0]).toMatchObject({
    type: "courtyard_collision",
    componentA: "R1",
    componentB: "R2",
    clearance: -1,
  })
  expect(report.components.map((component) => component.issues.length)).toEqual(
    [1, 1],
  )
})

test("circle courtyards contribute their bounds to top-side occupancy", () => {
  const report = analyzeAllPlacements(fixture()).getReport()
  // Union of two 4x4 bounds overlapping by 1x4; this is not exact circle area.
  expect(report.boardTopLayer?.occupiedArea).toBe(28)
  expect(report.boardTopLayer?.utilizationPercent).toBeCloseTo(7, 10)
})

test("diagonal circles with overlapping bounds do not produce collisions", () => {
  expect(collisions(fixture(circle(0, 0), circle(3, 3)))).toEqual([])
})

test("tangent and separated circles do not produce collisions", () => {
  expect(collisions(fixture(circle(0, 0), circle(4, 0)))).toEqual([])
  expect(collisions(fixture(circle(0, 0), circle(5, 0)))).toEqual([])
})

test("circle-rectangle intersection excludes empty circle corners", () => {
  const rectangle = {
    type: "pcb_courtyard_rect",
    center: { x: 2, y: 2 },
    width: 0.5,
    height: 0.5,
    layer: "top",
  }
  expect(collisions(fixture(circle(0, 0), rectangle))).toEqual([])
  expect(
    collisions(
      fixture(circle(0, 0), { ...rectangle, center: { x: 1.5, y: 0 } }),
    ),
  ).toHaveLength(1)
})

test("oriented rectangle metadata prevents a false circle collision", () => {
  expect(
    collisions(
      fixture(circle(0, 0, 0.2), {
        type: "pcb_courtyard_rect",
        center: { x: 1, y: -1 },
        width: 4,
        height: 0.2,
        ccw_rotation: 45,
        layer: "top",
      }),
    ),
  ).toEqual([])
})

test("circle intersects the actual rotated rectangle in either component order", () => {
  const rectangle = {
    type: "pcb_courtyard_rect",
    center: { x: 0.5, y: 0.5 },
    width: 4,
    height: 0.2,
    ccw_rotation: 45,
    layer: "top",
  }
  expect(collisions(fixture(circle(0, 0, 0.2), rectangle))).toHaveLength(1)
  expect(collisions(fixture(rectangle, circle(0, 0, 0.2)))).toHaveLength(1)
})

test("circle layer falls back to the owning component layer", () => {
  expect(
    collisions(fixture({ ...circle(0, 0), layer: undefined }, circle(3, 0))),
  ).toHaveLength(1)
})

test("opposite-layer circles do not collide and bottom occupancy is excluded", () => {
  const data = fixture(circle(0, 0), { ...circle(3, 0), layer: "bottom" })
  const second = data.find(
    (item) =>
      item.type === "pcb_component" &&
      item.pcb_component_id === "pcb_component_2",
  )!
  second.layer = "bottom"
  const report = analyzeAllPlacements(data).getReport()
  expect(report.issues).toEqual([])
  expect(report.boardTopLayer?.occupiedArea).toBe(16)
})

test("invalid circle radius or center is ignored without manufacturing bounds", () => {
  for (const radius of [
    0,
    -1,
    NaN,
    Infinity,
    -Infinity,
    undefined,
    null,
    "2",
  ]) {
    expect(collisions(fixture({ ...circle(0, 0), radius }))).toEqual([])
  }
  for (const center of [
    undefined,
    null,
    {},
    { x: NaN, y: 0 },
    { x: 0, y: Infinity },
    { x: "0", y: 0 },
  ]) {
    expect(collisions(fixture({ ...circle(0, 0), center }))).toEqual([])
  }
})

test("orphaned circle records do not attach to another component", () => {
  const data = fixture()
  const first = data.find(
    (item) =>
      item.type === "pcb_courtyard_circle" &&
      item.pcb_component_id === "pcb_component_1",
  )!
  first.pcb_component_id = "missing"
  expect(collisions(data)).toEqual([])
})
