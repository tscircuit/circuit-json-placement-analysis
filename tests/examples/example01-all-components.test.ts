// @ts-nocheck
import { expect, test } from "bun:test"
import circuitJson from "../../examples/example01/example01-pinheader_off_board.circuit.json"
import { analyzeAllPlacements } from "../../lib/index"

test("runs placement analysis for all components in example01", () => {
  const analysis = analyzeAllPlacements(circuitJson)
  const lineItems = analysis.getLineItems()
  const text = analysis.getString()

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
  expect(text).toContain("U1.center=(0mm, 0mm) on top")
  expect(text).toContain("J2.center=(22mm, 0mm) on top")
})
