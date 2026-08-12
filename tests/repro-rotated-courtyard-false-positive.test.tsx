// @ts-nocheck
import "bun-match-svg"
import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { Circuit } from "tscircuit"
import { analyzeAllPlacements } from "../lib/index"

test("repro: rotated J5 courtyard does not collide with U4", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="40mm" height="40mm" routingDisabled>
      <chip
        name="U4"
        schSheetName="shutdown_debug"
        pcbX={7.4}
        footprint="soic8"
        pcbY={-5.1}
        pcbRotation={90}
        schX={6.5}
        schY={-2}
      />
      <pinheader
        name="J5"
        schSheetName="shutdown_debug"
        pinCount={3}
        pitch="2.54mm"
        gender="male"
        pcbX={12.5}
        pcbY={-5.2}
        pcbRotation={90}
        schX={10}
        schY={1}
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const analysis = analyzeAllPlacements(circuitJson)
  const courtyardCollisions = analysis
    .getIssues()
    .filter((issue) => issue.type === "courtyard_collision")

  expect(analysis.getString()).toMatchInlineSnapshot(`
    "placement summary: 1 courtyard collision

    worst issues:
    1. U4 and J5 courtyard collision by 1.982mm. Suggested move: move U4 1.982mm left.

    board top-layer utilization:
    - occupied: 3.479% (55.658mm^2 of 1600mm^2)
    - empty spaces over 5% of board area:
      - 61.569% (985.1mm^2); bounds=(minX=-20mm, maxX=4.628mm, minY=-20mm, maxY=20mm)
      - 14.391% (230.258mm^2); bounds=(minX=10.172mm, maxX=20mm, minY=-3.43mm, maxY=20mm)
      - 8.003% (128.052mm^2); bounds=(minX=10.172mm, maxX=20mm, minY=-20mm, maxY=-6.97mm)

    board-edge status:
    - U4: 10.195mm inside right edge
    - J5: 6.75mm inside right edge

    flagged components:
    - U4
      source placement: placement_mode=none
      resolved placement: center=(7.4mm, -5.1mm) on top; bounds=(minX=4.995mm, maxX=9.805mm, minY=-7.55mm, maxY=-2.65mm); size=(width=4.81mm, height=4.9mm); anchor_alignment="center"
      board edge status: 10.195mm inside right edge
      issues:
      - U4 and J5 courtyard collision by 1.982mm. Suggested move: move U4 1.982mm left.
    - J5
      source placement: placement_mode=none
      resolved placement: center=(12.5mm, -5.2mm) on top; bounds=(minX=11.75mm, maxX=13.25mm, minY=-8.49mm, maxY=-1.91mm); size=(width=1.5mm, height=6.58mm); anchor_alignment="center"; orientation=vertical
      board edge status: 6.75mm inside right edge
      issues:
      - U4 and J5 courtyard collision by 1.982mm. Suggested move: move U4 1.982mm left."
  `)
  await expect(
    convertCircuitJsonToPcbSvg(
      circuitJson.filter((element) => element.type !== "pcb_board"),
      {
        showCourtyards: true,
        shouldDrawErrors: true,
      },
    ),
  ).toMatchSvgSnapshot(import.meta.path)
    expect(courtyardCollisions).toHaveLength(1)
  expect(analysis.getString()).toMatchInlineSnapshot(`
    "placement summary: 1 courtyard collision

    worst issues:
    1. U4 and J5 courtyard collision by 1.982mm. Suggested move: move U4 1.982mm left.

    board top-layer utilization:
    - occupied: 3.479% (55.658mm^2 of 1600mm^2)
    - empty spaces over 5% of board area:
      - 61.569% (985.1mm^2); bounds=(minX=-20mm, maxX=4.628mm, minY=-20mm, maxY=20mm)
      - 14.391% (230.258mm^2); bounds=(minX=10.172mm, maxX=20mm, minY=-3.43mm, maxY=20mm)
      - 8.003% (128.052mm^2); bounds=(minX=10.172mm, maxX=20mm, minY=-20mm, maxY=-6.97mm)

    board-edge status:
    - U4: 10.195mm inside right edge
    - J5: 6.75mm inside right edge

    flagged components:
    - U4
      source placement: placement_mode=none
      resolved placement: center=(7.4mm, -5.1mm) on top; bounds=(minX=4.995mm, maxX=9.805mm, minY=-7.55mm, maxY=-2.65mm); size=(width=4.81mm, height=4.9mm); anchor_alignment="center"
      board edge status: 10.195mm inside right edge
      issues:
      - U4 and J5 courtyard collision by 1.982mm. Suggested move: move U4 1.982mm left.
    - J5
      source placement: placement_mode=none
      resolved placement: center=(12.5mm, -5.2mm) on top; bounds=(minX=11.75mm, maxX=13.25mm, minY=-8.49mm, maxY=-1.91mm); size=(width=1.5mm, height=6.58mm); anchor_alignment="center"; orientation=vertical
      board edge status: 6.75mm inside right edge
      issues:
      - U4 and J5 courtyard collision by 1.982mm. Suggested move: move U4 1.982mm left."
  `)

})
