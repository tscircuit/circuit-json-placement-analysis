import { expect, test } from "bun:test"
import { analyzeAllPlacements } from "../lib/index"

test("do not place components do not produce placement collisions", () => {
  const jp4 = {
    type: "pcb_component",
    source_component_id: "source_component_1",
    pcb_component_id: "pcb_component_1",
    center: { x: 0, y: 0 },
    width: 1,
    height: 1,
    do_not_place: false,
  }
  const jp5 = {
    type: "pcb_component",
    source_component_id: "source_component_2",
    pcb_component_id: "pcb_component_2",
    center: { x: 2, y: 0 },
    width: 1,
    height: 1,
    do_not_place: false,
  }

  const circuitJson = [
    {
      type: "source_component",
      source_component_id: "source_component_1",
      name: "JP4",
    },
    {
      type: "source_component",
      source_component_id: "source_component_2",
      name: "JP5",
    },
    jp4,
    jp5,
    {
      type: "pcb_board",
      center: { x: 0, y: 0 },
      width: 20,
      height: 20,
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
      layer: "top",
      center: { x: 2, y: 0 },
      width: 4,
      height: 4,
    },
  ]

  const placedAnalysis = analyzeAllPlacements(circuitJson)
  expect(placedAnalysis.getIssues().map((issue) => issue.type)).toEqual([
    "courtyard_collision",
  ])

  jp4.do_not_place = true

  const doNotPlaceAnalysis = analyzeAllPlacements(circuitJson)
  expect(doNotPlaceAnalysis.getIssues()).toEqual([])
  expect(doNotPlaceAnalysis.getReport().components).toHaveLength(2)

  jp4.do_not_place = false
  jp5.do_not_place = true
  expect(analyzeAllPlacements(circuitJson).getIssues()).toEqual([])
})
