import { expect, test } from "bun:test"
import { analyzeComponentPlacement } from "../lib"

const makeCircuit = (x: number, y: number) => [
  {
    type: "pcb_board",
    center: { x: 0, y: 0 },
    width: 30,
    height: 30,
  },
  {
    type: "source_component",
    source_component_id: "sc1",
    name: "R1",
    ftype: "simple_resistor",
  },
  {
    type: "source_component",
    source_component_id: "sc2",
    name: "R2",
    ftype: "simple_resistor",
  },
  {
    type: "pcb_component",
    pcb_component_id: "pc1",
    source_component_id: "sc1",
    center: { x, y },
    width: 2,
    height: 4,
    layer: "top",
  },
  {
    type: "pcb_component",
    pcb_component_id: "pc2",
    source_component_id: "sc2",
    center: { x: 0, y: 0 },
    width: 4,
    height: 2,
    layer: "top",
  },
]

for (const { name, x, y, direction, distance, expression } of [
  {
    name: "right",
    x: 6,
    y: 0,
    direction: "right",
    distance: 6,
    expression: "R1.pcbX=calc(R2.x+6mm)",
  },
  {
    name: "left",
    x: -6,
    y: 0,
    direction: "left",
    distance: 6,
    expression: "R1.pcbX=calc(R2.x-6mm)",
  },
  {
    name: "up",
    x: 0,
    y: 6,
    direction: "up",
    distance: 6,
    expression: "R1.pcbY=calc(R2.y+6mm)",
  },
  {
    name: "down",
    x: 0,
    y: -6,
    direction: "down",
    distance: 6,
    expression: "R1.pcbY=calc(R2.y-6mm)",
  },
  {
    name: "diagonal",
    x: 6,
    y: 2,
    direction: "right",
    distance: 6,
    expression: "R1.pcbX=calc(R2.x+6mm)",
  },
  {
    name: "overlapping",
    x: 1,
    y: 0,
    direction: "right",
    distance: 1,
    expression: "R1.pcbX=calc(R2.x+1mm)",
  },
]) {
  test(`${name} component calculation uses center distance with unequal sizes`, () => {
    const analysis = analyzeComponentPlacement(makeCircuit(x, y), "R1")

    expect(analysis.getLineItems()).toContainEqual(
      expect.objectContaining({
        line_item_type: "relative_component_to_component_position",
        component_name: "R1",
        anchor_alignment: "center",
        other_component_name: "R2",
        other_anchor_alignment: "center",
        direction,
        distance,
      }),
    )
    expect(analysis.getString()).toContain(expression)
  })
}

test("component calc changes preserve board relation, bounds, and input", () => {
  const circuit = makeCircuit(6, 0)
  const original = structuredClone(circuit)
  const analysis = analyzeComponentPlacement(circuit, "R1")

  expect(analysis.getString()).toContain("R1.centerX=calc(board.centerX+6mm)")
  expect(analysis.getLineItems()).toContainEqual({
    line_item_type: "component_bounds",
    component_name: "R1",
    width: 2,
    height: 4,
    min_x: 5,
    max_x: 7,
    min_y: -2,
    max_y: 2,
  })
  expect(circuit).toEqual(original)
})
