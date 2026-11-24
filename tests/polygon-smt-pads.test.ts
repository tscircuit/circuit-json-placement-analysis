import { expect, test } from "bun:test"
import { analyzeAllPlacements } from "../lib/index"

test("polygon SMT pads contribute their bounds to overlap analysis", () => {
  const analysis = analyzeAllPlacements([
    {
      type: "source_component",
      source_component_id: "source_u1",
      name: "U1",
      ftype: "simple_chip",
    },
    {
      type: "source_component",
      source_component_id: "source_u2",
      name: "U2",
      ftype: "simple_chip",
    },
    {
      type: "pcb_component",
      source_component_id: "source_u1",
      pcb_component_id: "pcb_u1",
      center: { x: 0, y: 0 },
      width: 0.5,
      height: 0.5,
      layer: "top",
    },
    {
      type: "pcb_component",
      source_component_id: "source_u2",
      pcb_component_id: "pcb_u2",
      center: { x: 1, y: 0 },
      width: 0.5,
      height: 0.5,
      layer: "top",
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad_u1",
      pcb_component_id: "pcb_u1",
      shape: "polygon",
      points: [
        { x: -1, y: -0.5 },
        { x: 1, y: -0.5 },
        { x: 1, y: 0.5 },
        { x: -1, y: 0.5 },
      ],
      layer: "top",
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad_u2",
      pcb_component_id: "pcb_u2",
      shape: "polygon",
      points: [
        { x: 0, y: -0.5 },
        { x: 2, y: -0.5 },
        { x: 2, y: 0.5 },
        { x: 0, y: 0.5 },
      ],
      layer: "top",
    },
  ])

  expect(analysis.getIssues()).toEqual([
    {
      type: "pad_overlap",
      componentA: "U1",
      componentB: "U2",
      clearance: -1,
      severity: 420,
      summary: "U1 and U2 pad overlap by 1mm",
      suggested_move: "move U2 1mm right",
    },
  ])
})
