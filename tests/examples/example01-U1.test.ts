// @ts-nocheck
import { expect, test } from "bun:test"
import circuitJson from "../../examples/example01/example01-pinheader_off_board.circuit.json"
import { analyzeComponentPlacement } from "../../lib/index"

test("runs placement analysis for U1 in example01", () => {
  const analysis = analyzeComponentPlacement(circuitJson, "U1")
  const lineItems = analysis.getLineItems()
  const text = analysis.getString()

  expect(lineItems.length).toBeGreaterThan(0)
  expect(text).toMatchInlineSnapshot(`
"U1.center=(0mm, 0mm) on top
U1.bounds=(minX=-4.4mm, maxX=4.4mm, minY=-4.4mm, maxY=4.4mm, width=8.8mm, height=8.8mm)
U1.size=(width=8.8mm, height=8.8mm)
U1.anchor_alignment="center"
U1 placement definition: placement_mode=none
U1.pcbLeftEdgeX=calc(board.minX+25.6mm)
U1.pcbTopEdgeY=calc(board.minY+8.1mm)
U1.centerX=calc(board.centerX+0mm)
U1.pcbBottomEdgeY=calc(C1.maxY+8mm)"
`)
})
