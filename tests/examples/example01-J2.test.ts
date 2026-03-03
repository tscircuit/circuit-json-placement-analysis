// @ts-nocheck
import { expect, test } from "bun:test"
import circuitJson from "../../examples/example01/example01-pinheader_off_board.circuit.json"
import { analyzeComponentPlacement } from "../../lib/index"

test("runs placement analysis for J2 in example01", () => {
  const analysis = analyzeComponentPlacement(circuitJson, "J2")
  const lineItems = analysis.getLineItems()
  const text = analysis.getString()

  expect(lineItems.length).toBeGreaterThan(0)
  expect(text).toMatchInlineSnapshot(`
"J2.center=(22mm, 0mm) on top
J2.bounds=(minX=9.82mm, maxX=34.18mm, minY=-0.75mm, maxY=0.75mm)
J2.size=(width=24.36mm, height=1.5mm)
J2.orientation=horizontal
J2.anchor_alignment="center"
J2 placement definition: placement_mode=none
J2.pcbRightEdgeX=calc(board.maxX+4.18mm) [offboard]
J2.pcbTopEdgeY=calc(board.minY+11.75mm)
J2.centerX=calc(board.centerX+22mm)
J2.pcbLeftEdgeX=calc(D1.maxX+8mm)"
`)
})
