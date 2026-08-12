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

const renderButtonCircuit = async () => {
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
  const circuitJson = await renderButtonCircuit()
  const analysis = analyzeAllPlacements(circuitJson)

  expect(analysis.getIssues()).toContainEqual({
    type: "suboptimal_orientation",
    componentA: "R_BTN2",
    clearance: expect.closeTo(3.024, 3),
    severity: expect.any(Number),
    summary:
      "R_BTN2 direct connections would be 3.024mm shorter if rotated 180 degrees",
    suggested_move: "rotate R_BTN2 180 degrees",
  })
  expect(analysis.getString()).toContain(
    "placement summary: 1 suboptimal orientation",
  )
  expect(analysis.getString()).toContain(
    "R_BTN2 direct connections would be 3.024mm shorter if rotated 180 degrees. Suggested move: rotate R_BTN2 180 degrees.",
  )
  await expect(
    convertCircuitJsonToPcbSvg(circuitJson, { shouldDrawErrors: true }),
  ).toMatchSvgSnapshot(import.meta.path)
})
