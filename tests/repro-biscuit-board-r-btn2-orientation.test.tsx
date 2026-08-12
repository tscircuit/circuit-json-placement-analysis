// @ts-nocheck
import "bun-match-svg"
import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { Circuit } from "tscircuit"
import { analyzeAllPlacements } from "../lib/index"

const ButtonFootprint = () => (
  <footprint>
    <smtpad
      portHints={["pin1"]}
      pcbX="4.05mm"
      pcbY="-2.25mm"
      width="1.5mm"
      height="1.3mm"
      shape="rect"
    />
    <smtpad
      portHints={["pin2"]}
      pcbX="-4.05mm"
      pcbY="-2.25mm"
      width="1.5mm"
      height="1.3mm"
      shape="rect"
    />
    <smtpad
      portHints={["pin3"]}
      pcbX="4.05mm"
      pcbY="2.25mm"
      width="1.5mm"
      height="1.3mm"
      shape="rect"
    />
    <smtpad
      portHints={["pin4"]}
      pcbX="-4.05mm"
      pcbY="2.25mm"
      width="1.5mm"
      height="1.3mm"
      shape="rect"
    />
    <silkscreenrect width="6.2mm" height="6.2mm" />
    <silkscreencircle radius="1.7mm" />
  </footprint>
)

const renderButtonCircuit = async ({
  rBtn2PcbRotation,
}: {
  rBtn2PcbRotation: number
}) => {
  const circuit = new Circuit()

  circuit.add(
    <board width="28mm" height="14mm">
      {/* The biscuit-board positions are translated +22.5mm on X so that
          R_BTN2 is at the origin while preserving its spacing from SW_BTN2. */}
      <pushbutton
        name="SW_BTN2"
        pcbX={-7.5}
        pcbY={0}
        pinLabels={{
          pin1: ["A"],
          pin2: ["A_ALT"],
          pin3: ["B"],
          pin4: ["B_ALT"],
        }}
        internallyConnectedPins={[
          ["pin1", "pin2"],
          ["pin3", "pin4"],
        ]}
        footprint={<ButtonFootprint />}
      />
      <resistor
        name="R_BTN2"
        resistance="10k"
        footprint="0603"
        pcbX={0}
        pcbY={0}
        pcbRotation={rBtn2PcbRotation}
      />
      <connector
        name="J_V3V3"
        pinLabels={{ pin1: ["V3V3"] }}
        pcbX={11}
        pcbY={0}
        footprint={
          <footprint>
            <smtpad
              portHints={["pin1"]}
              width="1.5mm"
              height="1.5mm"
              shape="rect"
            />
          </footprint>
        }
      />

      <trace from=".R_BTN2 > .pin1" to=".J_V3V3 > .V3V3" />
      <trace from=".R_BTN2 > .pin2" to=".SW_BTN2 > .A" />
    </board>,
  )

  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}

test("warns that biscuit-board R_BTN2 should rotate 180 degrees", async () => {
  const circuitJson = await renderButtonCircuit({ rBtn2PcbRotation: 0 })
  const analysis = analyzeAllPlacements(circuitJson)

  expect(analysis.getIssues()).toContainEqual({
    type: "suboptimal_orientation",
    componentA: "R_BTN2",
    clearance: 0,
    severity: 100,
    summary: "R_BTN2 direct traces cross the routing path between its pads",
    suggested_move: "rotate R_BTN2 180 degrees",
  })
  expect(analysis.getString()).toMatchInlineSnapshot(`
    "placement summary: 1 suboptimal orientation

    worst issues:
    1. R_BTN2 direct traces cross the routing path between its pads. Suggested move: rotate R_BTN2 180 degrees.

    board top-layer utilization:
    - occupied: 15.881% (62.252mm^2 of 392mm^2)
    - empty spaces over 5% of board area:
      - 31.321% (122.78mm^2); bounds=(minX=1.48mm, maxX=10.25mm, minY=-7mm, maxY=7mm)
      - 8.036% (31.5mm^2); bounds=(minX=11.75mm, maxX=14mm, minY=-7mm, maxY=7mm)
      - 6.071% (23.8mm^2); bounds=(minX=-14mm, maxX=-12.3mm, minY=-7mm, maxY=7mm)

    board-edge status:
    - SW_BTN2: 1.7mm inside left edge
    - R_BTN2: 6.525mm inside top edge
    - J_V3V3: 2.25mm inside right edge

    flagged components:
    - R_BTN2
      source placement: placement_mode=none
      resolved placement: center=(0mm, 0mm) on top; bounds=(minX=-1.225mm, maxX=1.225mm, minY=-0.475mm, maxY=0.475mm); size=(width=2.45mm, height=0.95mm); anchor_alignment="center"
      board edge status: 6.525mm inside top edge
      issues:
      - R_BTN2 direct traces cross the routing path between its pads. Suggested move: rotate R_BTN2 180 degrees."
  `)
  await expect(
    convertCircuitJsonToPcbSvg(circuitJson, { shouldDrawErrors: true }),
  ).toMatchSvgSnapshot(import.meta.path)
})

test("does not warn after R_BTN2 is rotated 180 degrees", async () => {
  const circuitJson = await renderButtonCircuit({ rBtn2PcbRotation: 180 })
  const orientationIssues = analyzeAllPlacements(circuitJson)
    .getIssues()
    .filter((issue) => issue.type === "suboptimal_orientation")

  expect(orientationIssues).toHaveLength(0)
})
