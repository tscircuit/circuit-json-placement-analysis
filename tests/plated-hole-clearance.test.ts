import { expect, test } from "bun:test"
import { analyzeComponentPlacement } from "../lib/analyzeComponentPlacement"

const makeCircuit = (hole: Record<string, unknown>, targetX = 3) => [
  { type: "source_component", source_component_id: "s1", name: "J1" },
  { type: "source_component", source_component_id: "s2", name: "R1" },
  { type: "pcb_component", pcb_component_id: "p1", source_component_id: "s1" },
  { type: "pcb_component", pcb_component_id: "p2", source_component_id: "s2" },
  {
    type: "pcb_plated_hole",
    shape: "circle",
    pcb_component_id: "p1",
    pcb_plated_hole_id: "h1",
    x: 0,
    y: 0,
    layers: ["top", "bottom"],
    hole_diameter: 1,
    ...hole,
  },
  {
    type: "pcb_smtpad",
    shape: "rect",
    pcb_component_id: "p2",
    pcb_smtpad_id: "pad1",
    x: targetX,
    y: 0,
    width: 1,
    height: 1,
    layer: "top",
  },
]

for (const component of ["J1", "R1"]) {
  test(`${component} clearance measures the outer copper, not the drill`, () => {
    const items = analyzeComponentPlacement(
      makeCircuit({ outer_diameter: 3 }),
      component,
    ).getLineItems()
    const clearance = items.find(
      (i) => i.line_item_type === "component_pad_clearance",
    )
    expect(clearance?.clearance).toBe(1)
  })
}

test("touching outer copper has zero clearance even when drill holes are apart", () => {
  const items = analyzeComponentPlacement(
    makeCircuit({ outer_diameter: 3 }, 2),
    "J1",
  ).getLineItems()
  expect(
    items.find((i) => i.line_item_type === "component_pad_clearance")
      ?.clearance,
  ).toBe(0)
})

test("rectangular pad dimensions take precedence over round dimensions", () => {
  const items = analyzeComponentPlacement(
    makeCircuit({
      shape: "circular_hole_with_rect_pad",
      rect_pad_width: 4,
      rect_pad_height: 2,
    }),
    "J1",
  ).getLineItems()
  expect(
    items.find((i) => i.line_item_type === "component_pad_clearance")
      ?.clearance,
  ).toBe(0.5)
})

test("legacy records with only a drill diameter keep their existing fallback", () => {
  const items = analyzeComponentPlacement(makeCircuit({}), "J1").getLineItems()
  expect(
    items.find((i) => i.line_item_type === "component_pad_clearance")
      ?.clearance,
  ).toBe(2)
})
