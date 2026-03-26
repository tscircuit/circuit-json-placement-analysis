// @ts-nocheck
import { expect, test } from "bun:test"
import circuitJson from "../../examples/example01/example01-pinheader_off_board.circuit.json"
import { analyzeAllPlacements } from "../../lib/index"

test("runs placement analysis for all components in example01", () => {
  const analysis = analyzeAllPlacements(circuitJson)
  const lineItems = analysis.getLineItems()
  const text = analysis.getString()
  const report = analysis.getReport()

  const sourceComponentNames = [
    ...new Set(
      circuitJson
        .filter(
          (el) => el.type === "source_component" && typeof el.name === "string",
        )
        .map((el) => el.name),
    ),
  ]

  const analyzedComponentNames = [
    ...new Set(lineItems.map((lineItem) => lineItem.component_name)),
  ]

  expect(lineItems.length).toBeGreaterThan(0)
  expect(analyzedComponentNames.sort()).toEqual(sourceComponentNames.sort())
  expect(report.summary.countsByType.off_board).toBe(1)
  expect(report.issues).toEqual([
    expect.objectContaining({
      type: "off_board",
      componentA: "J2",
      suggested_move: "move J2 4.18mm left to clear right edge",
    }),
  ])
  expect(text).toContain("placement summary: 1 off-board")
  expect(text).toContain("- J2: 4.18mm outside right edge")
})
