import { expect, test } from "bun:test"
import { analyzeAllPlacements, analyzeComponentPlacement } from "../lib/index"

type Pad = {
  shape: string
  x: number
  y: number
  radius?: number
  width?: number
  height?: number
  layer?: string
}
const circle = (x: number, y = 0, radius = 1): Pad => ({
  shape: "circle",
  x,
  y,
  radius,
})
const rect = (x: number, y = 0): Pad => ({
  shape: "rect",
  x,
  y,
  width: 2,
  height: 2,
})
const circuit = (pads: Pad[]) => [
  { type: "pcb_board", center: { x: 0, y: 0 }, width: 20, height: 20 },
  ...pads.flatMap((pad, i) => [
    {
      type: "source_component",
      source_component_id: `s${i}`,
      name: `U${i}`,
      ftype: "simple_chip",
    },
    {
      type: "pcb_component",
      pcb_component_id: `p${i}`,
      source_component_id: `s${i}`,
      center: { x: pad.x, y: pad.y },
      width: 0.1,
      height: 0.1,
      layer: pad.layer ?? "top",
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: `pad${i}`,
      pcb_component_id: `p${i}`,
      layer: "top",
      ...pad,
    },
  ]),
]

for (const [name, pads, expected] of [
  ["circle-circle on axis", [circle(0), circle(3)], 1],
  [
    "circle-circle diagonal",
    [circle(0), circle(1.5, 1.5)],
    Math.hypot(1.5, 1.5) - 2,
  ],
  ["circle-rectangle on axis", [circle(0), rect(3)], 1],
  ["rectangle-circle on axis", [rect(0), circle(3)], 1],
  ["circle-rectangle diagonal", [circle(0), rect(2, 2)], Math.SQRT2 - 1],
  ["touching circles", [circle(0), circle(2)], 0],
  ["overlapping circles", [circle(0), circle(1)], 0],
] as const) {
  test(`per-component clearance includes ${name}`, () => {
    const result = analyzeComponentPlacement(circuit([...pads]), "U0")
      .getLineItems()
      .find((item) => item.line_item_type === "component_pad_clearance")
    expect(result?.clearance).toBeCloseTo(expected, 8)
  })
}

for (const pads of [
  [circle(0), circle(1.5)],
  [circle(0), rect(1.5)],
  [rect(0), circle(1.5)],
]) {
  test(`board report detects ${pads.map((p) => p.shape).join("/")} copper overlap`, () => {
    const issues = analyzeAllPlacements(circuit(pads))
      .getIssues()
      .filter((i) => i.type === "pad_overlap")
    expect(issues).toHaveLength(1)
    expect(issues[0]?.clearance).toBeCloseTo(-0.5, 8)
  })
}

test("diagonally separated circles do not create bounding-box pad overlaps", () => {
  const issues = analyzeAllPlacements(
    circuit([circle(0), circle(1.5, 1.5)]),
  ).getIssues()
  expect(issues.filter((i) => i.type === "pad_overlap")).toEqual([])
})

test("circle outside a rectangle corner is not a pad overlap", () => {
  const issues = analyzeAllPlacements(
    circuit([circle(0), rect(1.8, 1.8)]),
  ).getIssues()
  expect(issues.filter((i) => i.type === "pad_overlap")).toEqual([])
})

test("opposite-side circular pads do not produce pad overlaps", () => {
  const issues = analyzeAllPlacements(
    circuit([circle(0), { ...circle(0), layer: "bottom" }]),
  ).getIssues()
  expect(issues.filter((i) => i.type === "pad_overlap")).toEqual([])
})

test("a circle contained in a rectangle reports its separation depth", () => {
  const issues = analyzeAllPlacements(circuit([circle(0, 0, 0.5), rect(0)]))
    .getIssues()
    .filter((i) => i.type === "pad_overlap")
  expect(issues[0]?.clearance).toBeCloseTo(-1.5, 8)
  expect(issues[0]?.suggested_move).toBe("move U1 1.5mm right")
})
