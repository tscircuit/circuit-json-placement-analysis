import { expect, test } from "bun:test"
import { analyzeComponentPlacement } from "../lib/analyzeComponentPlacement"

type Pad = Record<string, unknown>
const smt = (layer: string | undefined, x = 0): Pad => ({
  type: "pcb_smtpad",
  shape: "rect",
  width: 1,
  height: 1,
  x,
  y: 0,
  layer,
})
const plated = (layers: string[]): Pad => ({
  type: "pcb_plated_hole",
  shape: "circle",
  hole_diameter: 1,
  outer_diameter: 1,
  layers,
  x: 0,
  y: 0,
})
const clearance = (pads: Pad[]) => {
  const circuit = pads.flatMap((pad, i) => [
    { type: "source_component", source_component_id: `s${i}`, name: `U${i}` },
    {
      type: "pcb_component",
      pcb_component_id: `p${i}`,
      source_component_id: `s${i}`,
    },
    { ...pad, pcb_component_id: `p${i}` },
  ])
  return analyzeComponentPlacement(circuit, "U0")
    .getLineItems()
    .find((item) => item.line_item_type === "component_pad_clearance")
}

test("nearest pad excludes opposite-side copper even at the same XY position", () => {
  const result = clearance([smt("top"), smt("bottom"), smt("top", 5)])
  expect(result?.nearest_component_name).toBe("U2")
  expect(result?.clearance).toBe(4)
})

test("no pad clearance is emitted when all candidate copper layers are disjoint", () => {
  expect(clearance([smt("top"), smt("bottom")])).toBeUndefined()
})

test("through-hole copper can be compared with a bottom-side pad", () => {
  expect(
    clearance([plated(["top", "bottom"]), smt("bottom", 3)])?.clearance,
  ).toBe(2)
})

test("a plated pad does not match an unlisted inner layer", () => {
  expect(
    clearance([plated(["top", "bottom"]), smt("inner1", 3)]),
  ).toBeUndefined()
})

test("plated pads are compared only when their layer sets intersect", () => {
  expect(
    clearance([plated(["top", "inner1"]), plated(["inner2", "bottom"])]),
  ).toBeUndefined()
  expect(
    clearance([plated(["top", "inner1"]), plated(["inner1", "bottom"])])
      ?.clearance,
  ).toBe(0)
})

test("records without layer information keep the existing conservative comparison", () => {
  expect(clearance([smt(undefined), smt("bottom", 3)])?.clearance).toBe(2)
  expect(clearance([smt("top"), smt(undefined, 3)])?.clearance).toBe(2)
})
