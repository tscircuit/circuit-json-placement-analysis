import "bun-match-svg"
import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { Circuit } from "tscircuit"
import { analyzeAllPlacements, analyzeComponentPlacement } from "../lib/index"
import AsymmetricFlexTail from "./fixtures/asymmetric-flex-tail"

test("a component inside an asymmetric flex tail is not reported off-board", async () => {
  const circuit = new Circuit()
  circuit.add(<AsymmetricFlexTail />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const analysis = analyzeAllPlacements(circuitJson)
  const componentAnalysis = analyzeComponentPlacement(circuitJson, "R_TAIL")

  // The actual copper is contained in the tail (x=5..30, y=-2..2),
  // while the board's placement origin remains at (0, 0).
  const pads = circuitJson.filter((element) => element.type === "pcb_smtpad")
  expect(pads).toHaveLength(2)
  for (const pad of pads) {
    if (pad.shape !== "rect") throw new Error("Expected rectangular 0402 pads")
    expect(pad.x - pad.width / 2).toBeGreaterThan(5)
    expect(pad.x + pad.width / 2).toBeLessThan(30)
    expect(pad.y - pad.height / 2).toBeGreaterThan(-2)
    expect(pad.y + pad.height / 2).toBeLessThan(2)
  }

  expect(
    analysis.getIssues().filter((issue) => issue.type === "off_board"),
  ).toEqual([])
  expect(analysis.getReport().components[0]?.boardEdgeStatus).toMatchObject({
    edge: "right",
    status: "inside",
  })
  expect(
    analysis.getReport().components[0]?.boardEdgeStatus?.distance,
  ).toBeCloseTo(2.22)
  expect(componentAnalysis.getString()).toContain(
    "R_TAIL.pcbRightEdgeX=calc(board.maxX-2.22mm)",
  )
  expect(componentAnalysis.getString()).not.toContain("[offboard]")
  await expect(convertCircuitJsonToPcbSvg(circuitJson)).toMatchSvgSnapshot(
    import.meta.path,
  )
})
