import { expect, test } from "bun:test"
import { analyzeAllPlacements } from "../lib/index"

test("board top-layer utilization falls back to top copper bounds when no courtyard is present", () => {
  const analysis = analyzeAllPlacements([
    {
      type: "source_component",
      source_component_id: "source_component_1",
      name: "U1",
      ftype: "simple_chip",
    },
    {
      type: "source_component",
      source_component_id: "source_component_2",
      name: "R1",
      ftype: "simple_resistor",
    },
    {
      type: "pcb_component",
      source_component_id: "source_component_1",
      pcb_component_id: "pcb_component_1",
      center: { x: -3.5, y: 0 },
      width: 3,
      height: 4,
      layer: "top",
    },
    {
      type: "pcb_component",
      source_component_id: "source_component_2",
      pcb_component_id: "pcb_component_2",
      center: { x: 3.5, y: 0 },
      width: 3,
      height: 4,
      layer: "top",
    },
    {
      type: "pcb_board",
      center: { x: 0, y: 0 },
      width: 10,
      height: 4,
    },
    {
      type: "pcb_courtyard_rect",
      pcb_component_id: "pcb_component_1",
      center: { x: -3.5, y: 0 },
      width: 3,
      height: 4,
    },
    {
      type: "pcb_smtpad",
      pcb_component_id: "pcb_component_2",
      x: 2.75,
      y: 0,
      width: 1.5,
      height: 4,
      layer: "top",
    },
    {
      type: "pcb_smtpad",
      pcb_component_id: "pcb_component_2",
      x: 4.25,
      y: 0,
      width: 1.5,
      height: 4,
      layer: "top",
    },
  ])

  expect(analysis.getString()).toMatchInlineSnapshot(`
    "placement summary: no placement issues

    board top-layer utilization:
    - occupied: 60% (24mm^2 of 40mm^2)
    - empty spaces over 5% of board area:
      - 40% (16mm^2); bounds=(minX=-2mm, maxX=2mm, minY=-2mm, maxY=2mm)

    board-edge status:
    - U1: 0mm inside left edge
    - R1: 0mm inside right edge"
  `)
})
