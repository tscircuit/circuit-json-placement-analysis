// @ts-nocheck
import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { analyzeAllPlacements } from "../lib/index"

test("placement analysis summarizes overlaps, connector intrusions, clusters, and machine-readable issues", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <chip
        name="USB1"
        footprint="dip4_w0.1in"
        manufacturerPartNumber="USB-C-BREAKOUT"
        pcbX={-7}
        pcbY={0}
        pinLabels={{
          pin1: "GND",
          pin2: "VBUS",
          pin3: "DP",
          pin4: "DM",
        }}
      />

      <capacitor
        name="C1"
        capacitance="1uF"
        footprint="0603"
        pcbX={-6.7}
        pcbY={0}
      />

      <resistor
        name="R1"
        resistance="1k"
        footprint="0603"
        pcbX={-6.6}
        pcbY={0.4}
      />

      <resistor
        name="R2"
        resistance="1k"
        footprint="0603"
        pcbX={-6.6}
        pcbY={0.4}
      />

      <pinheader
        name="J1"
        footprint="pinrow2"
        pinCount={2}
        gender="female"
        pcbX={9.7}
        pcbY={0}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const analysis = analyzeAllPlacements(circuit.getCircuitJson())

  expect(analysis.getString()).toMatchInlineSnapshot(`
    "placement summary: 6 pad overlaps, 1 off-board, 3 connector-body intrusions

    worst issues:
    1. R1 and R2 pad overlap by 0.8mm. Suggested move: move R2 0.8mm right.
    2. J1 is 1.72mm outside right edge. Suggested move: move J1 1.72mm left to clear right edge.
    3. C1 intrudes 0.95mm into USB1 connector body. Suggested move: move C1 0.95mm down.
    4. R1 intrudes 0.95mm into USB1 connector body. Suggested move: move R1 0.95mm down.
    5. R2 intrudes 0.95mm into USB1 connector body. Suggested move: move R2 0.95mm down.

    likely bad clusters:
    - USB cluster: USB1, R1, R2, C1

    board-edge status:
    - USB1: 1.01mm inside left edge
    - C1: 2.075mm inside left edge
    - R1: 2.175mm inside left edge
    - R2: 2.175mm inside left edge
    - J1: 1.72mm outside right edge

    flagged components:
    - USB1
      source placement: placement_mode=none
      resolved placement: center=(-7mm, 0mm) on top; bounds=(minX=-8.99mm, maxX=-5.01mm, minY=-2.07mm, maxY=2.07mm); size=(width=3.98mm, height=4.14mm); anchor_alignment=\"center\"
      board edge status: 1.01mm inside left edge
      issues:
      - C1 intrudes 0.95mm into USB1 connector body. Suggested move: move C1 0.95mm down.
      - R1 intrudes 0.95mm into USB1 connector body. Suggested move: move R1 0.95mm down.
      - R2 intrudes 0.95mm into USB1 connector body. Suggested move: move R2 0.95mm down.
      - USB1 and R1 pad overlap by 0.405mm. Suggested move: move R1 0.405mm down.
      - USB1 and R2 pad overlap by 0.405mm. Suggested move: move R2 0.405mm down.
      - USB1 and C1 pad overlap by 0.005mm. Suggested move: move C1 0.005mm down.
    - C1
      source placement: placement_mode=none
      resolved placement: center=(-6.7mm, 0mm) on top; bounds=(minX=-7.925mm, maxX=-5.475mm, minY=-0.475mm, maxY=0.475mm); size=(width=2.45mm, height=0.95mm); anchor_alignment=\"center\"
      board edge status: 2.075mm inside left edge
      issues:
      - C1 intrudes 0.95mm into USB1 connector body. Suggested move: move C1 0.95mm down.
      - C1 and R1 pad overlap by 0.55mm. Suggested move: move R1 0.55mm down.
      - C1 and R2 pad overlap by 0.55mm. Suggested move: move R2 0.55mm down.
      - USB1 and C1 pad overlap by 0.005mm. Suggested move: move C1 0.005mm down.
    - R1
      source placement: placement_mode=none
      resolved placement: center=(-6.6mm, 0.4mm) on top; bounds=(minX=-7.825mm, maxX=-5.375mm, minY=-0.075mm, maxY=0.875mm); size=(width=2.45mm, height=0.95mm); anchor_alignment=\"center\"
      board edge status: 2.175mm inside left edge
      issues:
      - R1 and R2 pad overlap by 0.8mm. Suggested move: move R2 0.8mm right.
      - R1 intrudes 0.95mm into USB1 connector body. Suggested move: move R1 0.95mm down.
      - C1 and R1 pad overlap by 0.55mm. Suggested move: move R1 0.55mm down.
      - USB1 and R1 pad overlap by 0.405mm. Suggested move: move R1 0.405mm down.
    - R2
      source placement: placement_mode=none
      resolved placement: center=(-6.6mm, 0.4mm) on top; bounds=(minX=-7.825mm, maxX=-5.375mm, minY=-0.075mm, maxY=0.875mm); size=(width=2.45mm, height=0.95mm); anchor_alignment=\"center\"
      board edge status: 2.175mm inside left edge
      issues:
      - R1 and R2 pad overlap by 0.8mm. Suggested move: move R2 0.8mm right.
      - R2 intrudes 0.95mm into USB1 connector body. Suggested move: move R2 0.95mm down.
      - C1 and R2 pad overlap by 0.55mm. Suggested move: move R2 0.55mm down.
      - USB1 and R2 pad overlap by 0.405mm. Suggested move: move R2 0.405mm down.
    - J1
      source placement: placement_mode=none
      resolved placement: center=(9.7mm, 0mm) on top; bounds=(minX=7.68mm, maxX=11.72mm, minY=-0.75mm, maxY=0.75mm); size=(width=4.04mm, height=1.5mm); anchor_alignment=\"center\"; orientation=horizontal
      board edge status: 1.72mm outside right edge
      issues:
      - J1 is 1.72mm outside right edge. Suggested move: move J1 1.72mm left to clear right edge."
  `)
})
