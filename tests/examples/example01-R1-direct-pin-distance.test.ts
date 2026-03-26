// @ts-nocheck
import { expect, test } from "bun:test"
import circuitJson from "../../examples/example01/example01-pinheader_off_board.circuit.json"
import { analyzeComponentPlacement } from "../../lib/index"

test("includes direct pin-to-pin distance for connected pins on R1", () => {
  const analysis = analyzeComponentPlacement(circuitJson, "R1")
  const text = analysis.getString()

  expect(text).toContain("R1.pin2 -> D1.pin1 distance: 2.35mm")
})
