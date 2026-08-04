import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { analyzeAllPlacements } from "../lib/index"

test("analysis snapshot for usb-audio-device includes the Y1/C7 placement error", () => {
  const circuitJson = JSON.parse(
    readFileSync(
      new URL("./assets/usb-audio-device.json", import.meta.url),
      "utf8",
    ),
  )

  const analysis = analyzeAllPlacements(circuitJson)

  expect(analysis.getString()).toMatchInlineSnapshot(`
    "placement summary: 2 courtyard collisions, 2 footprint intrusions, 5 avoidable-via rotations

    worst issues:
    1. Y1 and C7 footprint intrusion by 0.04mm. Suggested move: move C7 0.04mm up.
    2. U1 and U4 footprint intrusion by 0.005mm. Suggested move: move U4 0.005mm up.
    3. Y1 and J3 courtyard collision by 0.17mm. Suggested move: move Y1 0.17mm left.
    4. C5 and U1 courtyard collision by 0mm. Suggested move: move C5 0mm down.
    5. C1 has crossed two-pin connections using 2 vias. Suggested rotation: rotate C1 180° to uncross its connections and potentially remove 2 vias.

    likely bad clusters:
    - J3 cluster: Y1, C7, J3
    - U1 cluster: U1, U4, C5

    board top-layer utilization:
    - occupied: 45.961% (758.358mm^2 of 1650mm^2)
    - empty spaces over 5% of board area:
      - 7.571% (124.923mm^2); bounds=(minX=9.93mm, maxX=27.5mm, minY=-2.15mm, maxY=4.96mm)
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
    - C1
      source placement: placement_mode=none
      resolved placement: center=(-15.8mm, -2.8mm) on top; bounds=(minX=-17.025mm, maxX=-14.575mm, minY=-3.275mm, maxY=-2.325mm); size=(width=2.45mm, height=0.95mm); anchor_alignment="center"
      board edge status: 10.475mm inside left edge
      issues:
      - C1 has crossed two-pin connections using 2 vias. Suggested rotation: rotate C1 180° to uncross its connections and potentially remove 2 vias.
    - C4
      source placement: placement_mode=none
      resolved placement: center=(-12.5mm, 12mm) on top; bounds=(minX=-13.925mm, maxX=-11.075mm, minY=11.3mm, maxY=12.7mm); size=(width=2.85mm, height=1.4mm); anchor_alignment="center"
      board edge status: 2.3mm inside bottom edge
      issues:
      - C4 has crossed two-pin connections using 2 vias. Suggested rotation: rotate C4 180° to uncross its connections and potentially remove 2 vias.
    - C5
      source placement: placement_mode=none
      resolved placement: center=(-8.9mm, 7.6mm) on top; bounds=(minX=-10.325mm, maxX=-7.475mm, minY=6.9mm, maxY=8.3mm); size=(width=2.85mm, height=1.4mm); anchor_alignment="center"
      board edge status: 6.7mm inside bottom edge
      issues:
      - C5 and U1 courtyard collision by 0mm. Suggested move: move C5 0mm down.
      - C5 has crossed two-pin connections using 2 vias. Suggested rotation: rotate C5 180° to uncross its connections and potentially remove 2 vias.
    - U1
      source placement: placement_mode=none
      resolved placement: center=(-1mm, 0mm) on top; bounds=(minX=-7.4mm, maxX=5.4mm, minY=-6.4mm, maxY=6.4mm); size=(width=12.8mm, height=12.8mm); anchor_alignment="center"
      board edge status: 8.6mm inside top edge
      issues:
      - U1 and U4 footprint intrusion by 0.005mm. Suggested move: move U4 0.005mm up.
      - C5 and U1 courtyard collision by 0mm. Suggested move: move C5 0mm down.
    - Y1
      source placement: placement_mode=none
      resolved placement: center=(12.61mm, -9.31mm) on top; bounds=(minX=8mm, maxX=17.22mm, minY=-13.92mm, maxY=-4.7mm); size=(width=9.22mm, height=9.22mm); anchor_alignment="center"
      board edge status: 1.08mm inside top edge
      issues:
      - Y1 and C7 footprint intrusion by 0.04mm. Suggested move: move C7 0.04mm up.
      - Y1 and J3 courtyard collision by 0.17mm. Suggested move: move Y1 0.17mm left.
    - C7
      source placement: placement_mode=none
      resolved placement: center=(15.8mm, -14.2mm) on top; bounds=(minX=15.02mm, maxX=16.58mm, minY=-14.52mm, maxY=-13.88mm); size=(width=1.56mm, height=0.64mm); anchor_alignment="center"
      board edge status: 0.48mm inside top edge
      issues:
      - Y1 and C7 footprint intrusion by 0.04mm. Suggested move: move C7 0.04mm up.
    - U4
      source placement: placement_mode=none
      resolved placement: center=(-8.9mm, -8.6mm) on top; bounds=(minX=-12.35mm, maxX=-5.45mm, minY=-10.805mm, maxY=-6.395mm); size=(width=6.9mm, height=4.41mm); anchor_alignment="center"
      board edge status: 4.195mm inside top edge
      issues:
      - U1 and U4 footprint intrusion by 0.005mm. Suggested move: move U4 0.005mm up.
    - C9
      source placement: placement_mode=none
      resolved placement: center=(-8.6mm, 2.75mm) on top; bounds=(minX=-9.38mm, maxX=-7.82mm, minY=2.43mm, maxY=3.07mm); size=(width=1.56mm, height=0.64mm); anchor_alignment="center"
      board edge status: 11.93mm inside bottom edge
      issues:
      - C9 has crossed two-pin connections using 2 vias. Suggested rotation: rotate C9 180° to uncross its connections and potentially remove 2 vias.
    - C16
      source placement: placement_mode=none
      resolved placement: center=(6.8mm, -3.4mm) on top; bounds=(minX=6.02mm, maxX=7.58mm, minY=-3.72mm, maxY=-3.08mm); size=(width=1.56mm, height=0.64mm); anchor_alignment="center"
      board edge status: 11.28mm inside top edge
      issues:
      - C16 has crossed two-pin connections using 2 vias. Suggested rotation: rotate C16 180° to uncross its connections and potentially remove 2 vias.
    - J3
      source placement: placement_mode=none
      resolved placement: center=(24.23mm, -8mm) on top; bounds=(minX=22.21mm, maxX=26.25mm, minY=-13.83mm, maxY=-2.17mm); size=(width=4.04mm, height=11.66mm); anchor_alignment="center"; orientation=vertical
      board edge status: 1.17mm inside top edge
      issues:
      - Y1 and J3 courtyard collision by 0.17mm. Suggested move: move Y1 0.17mm left."
  `)
})
