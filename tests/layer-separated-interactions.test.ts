import { expect, test } from "bun:test"
import { analyzeAllPlacements } from "../lib/index"

test("top and bottom placement analysis stay separate when side is only present on geometry", () => {
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
      name: "U2",
      ftype: "simple_chip",
    },
    {
      type: "pcb_component",
      source_component_id: "source_component_1",
      pcb_component_id: "pcb_component_1",
      center: { x: 0, y: 0 },
      width: 4,
      height: 4,
    },
    {
      type: "pcb_component",
      source_component_id: "source_component_2",
      pcb_component_id: "pcb_component_2",
      center: { x: 0, y: 0 },
      width: 4,
      height: 4,
    },
    {
      type: "pcb_board",
      center: { x: 0, y: 0 },
      width: 10,
      height: 10,
    },
    {
      type: "pcb_courtyard_rect",
      pcb_component_id: "pcb_component_1",
      layer: "top",
      center: { x: 0, y: 0 },
      width: 4,
      height: 4,
    },
    {
      type: "pcb_courtyard_rect",
      pcb_component_id: "pcb_component_2",
      layer: "bottom",
      center: { x: 0, y: 0 },
      width: 4,
      height: 4,
    },
    {
      type: "pcb_smtpad",
      pcb_component_id: "pcb_component_1",
      x: -1,
      y: 0,
      width: 1,
      height: 1,
      layer: "top",
    },
    {
      type: "pcb_smtpad",
      pcb_component_id: "pcb_component_2",
      x: -1,
      y: 0,
      width: 1,
      height: 1,
      layer: "bottom",
    },
  ])

  const report = analysis.getReport()
  const u1 = report.components.find(
    (component) => component.componentName === "U1",
  )
  const u2 = report.components.find(
    (component) => component.componentName === "U2",
  )

  expect(analysis.getString()).toContain(
    "placement summary: no placement issues",
  )
  expect(report.issues).toEqual([])
  expect(report.boardTopLayer?.occupiedArea).toBe(16)
  expect(report.boardTopLayer?.utilizationPercent).toBe(16)
  expect(u1?.resolvedPlacement.center?.layer).toBe("top")
  expect(u2?.resolvedPlacement.center?.layer).toBe("bottom")
})
