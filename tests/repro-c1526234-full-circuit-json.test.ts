import "bun-match-svg"
import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import type { AnyCircuitElement } from "circuit-json"
import { analyzeAllPlacements } from "../lib/index"
import reproCircuitJson from "./assets/repro-c1526234-rotated-component-bounds.json"

test("repro: full C1526234 circuit JSON produces a false 0.64mm footprint intrusion", async () => {
  const circuitJson = reproCircuitJson as AnyCircuitElement[]
  const analysis = analyzeAllPlacements(circuitJson)

  expect(analysis.getIssues()).toContainEqual({
    type: "footprint_intrusion",
    componentA: "U1",
    componentB: "C2",
    clearance: expect.closeTo(-0.6399965, 6),
    severity: expect.any(Number),
    summary: "U1 and C2 footprint intrusion by 0.64mm",
    suggested_move: "move C2 0.64mm right",
  })
  expect(analysis.getString()).toContain(
    "placement summary: 1 footprint intrusion",
  )
  expect(analysis.getString()).toContain(
    "U1 and C2 footprint intrusion by 0.64mm. Suggested move: move C2 0.64mm right.",
  )

  await expect(
    convertCircuitJsonToPcbSvg(
      circuitJson.filter((element) => element.type !== "pcb_board"),
      { showCourtyards: true, shouldDrawErrors: true },
    ),
  ).toMatchSvgSnapshot(import.meta.path)
    expect(analysis.getString()).toMatchInlineSnapshot(`
      "placement summary: 1 footprint intrusion

      worst issues:
      1. U1 and C2 footprint intrusion by 0.64mm. Suggested move: move C2 0.64mm right.

      board top-layer utilization:
      - occupied: 3.184% (114.62mm^2 of 3600mm^2)
      - empty spaces over 5% of board area:
        - 70.594% (2541.397mm^2); bounds=(minX=-30mm, maxX=30mm, minY=-12.357mm, maxY=30mm)

      board-edge status:
      - U1: 5.285mm inside top edge
      - C2: 8.48mm inside top edge

      flagged components:
      - U1
        source placement: placement_mode=none
        resolved placement: center=(7.3mm, -18.995mm) on top; bounds=(minX=1.74mm, maxX=12.86mm, minY=-24.715mm, maxY=-13.275mm); size=(width=11.12mm, height=11.44mm); anchor_alignment="center"
        board edge status: 5.285mm inside top edge
        issues:
        - U1 and C2 footprint intrusion by 0.64mm. Suggested move: move C2 0.64mm right.
      - C2
        source placement: placement_mode=none
        resolved placement: center=(13mm, -21.2mm) on top; bounds=(minX=12.22mm, maxX=13.78mm, minY=-21.52mm, maxY=-20.88mm); size=(width=1.56mm, height=0.64mm); anchor_alignment="center"
        board edge status: 8.48mm inside top edge
        issues:
        - U1 and C2 footprint intrusion by 0.64mm. Suggested move: move C2 0.64mm right."
    `)
})
