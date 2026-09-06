import "bun-match-svg"
import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { readFileSync } from "node:fs"
import { analyzeAllPlacements } from "../lib/index"

test("analysis snapshot for usb-audio-device includes the Y1/C7 placement error", async () => {
  const circuitJson = JSON.parse(
    readFileSync(
      new URL("./assets/usb-audio-device.json", import.meta.url),
      "utf8",
    ),
  )

  const analysis = analyzeAllPlacements(circuitJson)

  expect(analysis.getString()).toMatchInlineSnapshot(`
    "placement summary: 5 courtyard collisions, 2 footprint intrusions, 2 suboptimal orientations

    worst issues:
    1. Y1 and C7 footprint intrusion by 0.04mm. Suggested move: move C7 0.04mm up.
    2. U1 and U4 footprint intrusion by 0.005mm. Suggested move: move U4 0.005mm up.
    3. C13 and J2 courtyard collision by 0.49mm. Suggested move: move C13 0.49mm up.
    4. U1 and C13 courtyard collision by 0.43mm. Suggested move: move C13 0.43mm down.
    5. C10 and J2 courtyard collision by 0.09mm. Suggested move: move C10 0.09mm up.

    likely bad clusters:
    - J2 cluster: U1, J2, C13, U4, C10, C15, C5

    board top-layer utilization:
    - occupied: 48.57% (801.412mm^2 of 1650mm^2)
    - empty spaces over 5% of board area:
      - 7.397% (122.058mm^2); bounds=(minX=9.93mm, maxX=21.19mm, minY=-2.15mm, maxY=8.69mm)
      - 7.259% (119.769mm^2); bounds=(minX=-27.5mm, maxX=4.87mm, minY=-15mm, maxY=-11.3mm)

    board-edge status:
    - J1: 0.026mm inside left edge
    - F1: 7.175mm inside left edge
    - R1: 6.72mm inside left edge
    - R2: 6.42mm inside left edge
    - C1: 10.475mm inside left edge
    - U2: 5.75mm inside bottom edge
    - C2: 3mm inside bottom edge
    - C3: 3mm inside bottom edge
    - U3: 5.75mm inside bottom edge
    - C4: 2.3mm inside bottom edge
    - C5: 6.7mm inside bottom edge
    - U1: 8.6mm inside top edge
    - R3: 1.88mm inside top edge
    - R4: 5.48mm inside bottom edge
    - C6: 5.48mm inside bottom edge
    - R5: 6.88mm inside bottom edge
    - R6: 6.88mm inside bottom edge
    - R7: 10.18mm inside bottom edge
    - Y1: 1.08mm inside top edge
    - C7: 0.48mm inside top edge
    - U4: 4.195mm inside top edge
    - C8: 5.58mm inside top edge
    - C9: 11.93mm inside bottom edge
    - C10: 6.32mm inside bottom edge
    - C11: 13.93mm inside top edge
    - C12: 6.32mm inside top edge
    - C13: 6mm inside bottom edge
    - C14: 5.55mm inside top edge
    - C15: 6.32mm inside bottom edge
    - C16: 11.28mm inside top edge
    - C17: 13.93mm inside bottom edge
    - J2: 1.25mm inside bottom edge
    - J3: 1.17mm inside top edge
    - J4: 1.17mm inside bottom edge

    flagged components:
    - C5
      source placement: placement_mode=none
      resolved placement: center=(-8.9mm, 7.6mm) on top; bounds=(minX=-10.325mm, maxX=-7.475mm, minY=6.9mm, maxY=8.3mm); size=(width=2.85mm, height=1.4mm); anchor_alignment="center"
      board edge status: 6.7mm inside bottom edge
      issues:
      - C5 and U1 courtyard collision by 0mm. Suggested move: move C5 0mm down.
    - U1
      source placement: placement_mode=none
      resolved placement: center=(-1mm, 0mm) on top; bounds=(minX=-7.4mm, maxX=5.4mm, minY=-6.4mm, maxY=6.4mm); size=(width=12.8mm, height=12.8mm); anchor_alignment="center"
      board edge status: 8.6mm inside top edge
      issues:
      - U1 and U4 footprint intrusion by 0.005mm. Suggested move: move U4 0.005mm up.
      - U1 and C13 courtyard collision by 0.43mm. Suggested move: move C13 0.43mm down.
      - C5 and U1 courtyard collision by 0mm. Suggested move: move C5 0mm down.
    - R6
      source placement: placement_mode=none
      resolved placement: center=(9mm, 7.8mm) on top; bounds=(minX=8.22mm, maxX=9.78mm, minY=7.48mm, maxY=8.12mm); size=(width=1.56mm, height=0.64mm); anchor_alignment="center"
      board edge status: 6.88mm inside bottom edge
      issues:
      - R6 connections cross the routing path between its pads. Suggested move: rotate R6 180 degrees.
    - Y1
      source placement: placement_mode=none
      resolved placement: center=(12.61mm, -9.31mm) on top; bounds=(minX=8mm, maxX=17.22mm, minY=-13.92mm, maxY=-4.7mm); size=(width=9.22mm, height=9.22mm); anchor_alignment="center"
      board edge status: 1.08mm inside top edge
      issues:
      - Y1 and C7 footprint intrusion by 0.04mm. Suggested move: move C7 0.04mm up.
    - C7
      source placement: placement_mode=none
      resolved placement: center=(15.8mm, -14.2mm) on top; bounds=(minX=15.02mm, maxX=16.58mm, minY=-14.52mm, maxY=-13.88mm); size=(width=1.56mm, height=0.64mm); anchor_alignment="center"
      board edge status: 0.48mm inside top edge
      issues:
      - Y1 and C7 footprint intrusion by 0.04mm. Suggested move: move C7 0.04mm up.
      - C7 connections cross the routing path between its pads. Suggested move: rotate C7 180 degrees.
    - U4
      source placement: placement_mode=none
      resolved placement: center=(-8.9mm, -8.6mm) on top; bounds=(minX=-12.35mm, maxX=-5.45mm, minY=-10.805mm, maxY=-6.395mm); size=(width=6.9mm, height=4.41mm); anchor_alignment="center"
      board edge status: 4.195mm inside top edge
      issues:
      - U1 and U4 footprint intrusion by 0.005mm. Suggested move: move U4 0.005mm up.
    - C10
      source placement: placement_mode=none
      resolved placement: center=(-1.25mm, 7.85mm) on top; bounds=(minX=-1.52mm, maxX=-0.98mm, minY=7.02mm, maxY=8.68mm); size=(width=0.54mm, height=1.66mm); anchor_alignment="center"
      board edge status: 6.32mm inside bottom edge
      issues:
      - C10 and J2 courtyard collision by 0.09mm. Suggested move: move C10 0.09mm up.
    - C13
      source placement: placement_mode=none
      resolved placement: center=(-4mm, 7.7mm) on top; bounds=(minX=-4.4mm, maxX=-3.6mm, minY=6.4mm, maxY=9mm); size=(width=0.8mm, height=2.6mm); anchor_alignment="center"
      board edge status: 6mm inside bottom edge
      issues:
      - C13 and J2 courtyard collision by 0.49mm. Suggested move: move C13 0.49mm up.
      - U1 and C13 courtyard collision by 0.43mm. Suggested move: move C13 0.43mm down.
    - C15
      source placement: placement_mode=none
      resolved placement: center=(1.5mm, 7.85mm) on top; bounds=(minX=1.23mm, maxX=1.77mm, minY=7.02mm, maxY=8.68mm); size=(width=0.54mm, height=1.66mm); anchor_alignment="center"
      board edge status: 6.32mm inside bottom edge
      issues:
      - C15 and J2 courtyard collision by 0.09mm. Suggested move: move C15 0.09mm up.
    - J2
      source placement: placement_mode=none
      resolved placement: center=(0mm, 11.73mm) on top; bounds=(minX=-9.64mm, maxX=9.64mm, minY=9.71mm, maxY=13.75mm); size=(width=19.28mm, height=4.04mm); anchor_alignment="center"; orientation=horizontal
      board edge status: 1.25mm inside bottom edge
      issues:
      - C13 and J2 courtyard collision by 0.49mm. Suggested move: move C13 0.49mm up.
      - C10 and J2 courtyard collision by 0.09mm. Suggested move: move C10 0.09mm up.
      - C15 and J2 courtyard collision by 0.09mm. Suggested move: move C15 0.09mm up."
  `)

  const focusedComponentNames = new Set(["C5", "U1", "C10", "C13", "C15", "J2"])
  const focusedSourceComponentIds = new Set(
    circuitJson
      .filter(
        (element: any) =>
          element.type === "source_component" &&
          focusedComponentNames.has(element.name),
      )
      .map((element: any) => element.source_component_id),
  )
  const focusedPcbComponentIds = new Set(
    circuitJson
      .filter(
        (element: any) =>
          element.type === "pcb_component" &&
          focusedSourceComponentIds.has(element.source_component_id),
      )
      .map((element: any) => element.pcb_component_id),
  )
  const focusedCircuitJson = circuitJson.filter((element: any) => {
    if (
      typeof element.type === "string" &&
      (element.type.endsWith("_error") || element.type.endsWith("_warning"))
    ) {
      return false
    }

    return (
      focusedSourceComponentIds.has(element.source_component_id) ||
      focusedPcbComponentIds.has(element.pcb_component_id)
    )
  })

  await expect(
    convertCircuitJsonToPcbSvg(focusedCircuitJson, {
      showCourtyards: true,
      shouldDrawErrors: false,
    }),
  ).toMatchSvgSnapshot(import.meta.path, "rotated-courtyard-collisions")
})
