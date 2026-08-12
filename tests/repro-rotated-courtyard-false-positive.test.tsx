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
    "placement summary: no placement issues

    board top-layer utilization:
    - occupied: 3.917% (62.676mm^2 of 1600mm^2)
    - empty spaces over 5% of board area:
      - 61.569% (985.1mm^2); bounds=(minX=-20mm, maxX=4.628mm, minY=-20mm, maxY=20mm)
      - 14.325% (229.2mm^2); bounds=(minX=14.27mm, maxX=20mm, minY=-20mm, maxY=20mm)

    board-edge status:
    - U4: 10.195mm inside right edge
    - J5: 6.75mm inside right edge"
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
  expect(courtyardCollisions).toHaveLength(0)
})
