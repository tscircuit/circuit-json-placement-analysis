import "bun-match-svg"
import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { Circuit } from "tscircuit"
import { analyzeAllPlacements } from "../lib"

const renderResistors = async (r2Y: number) => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm" routingDisabled>
      <resistor
        name="R1"
        resistance="1k"
        footprint="0805"
        pcbRotation={0}
        pcbX={0}
        pcbY={0}
      />
      <resistor
        name="R2"
        resistance="1k"
        footprint="0805"
        pcbRotation={0}
        pcbX={0}
        pcbY={r2Y}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}

test("rendered PCB separates vertically overlapping resistors by moving R2 up", async () => {
  const initialY = 1.6
  const original = await renderResistors(initialY)
  const issue = analyzeAllPlacements(original)
    .getIssues()
    .find((issue) => issue.type === "courtyard_collision")!
  expect(issue).toBeDefined()
  const match = /^move R2 ([\d.]+)mm up$/.exec(issue.suggested_move!)
  expect(match).not.toBeNull()
  const distance = Number(match![1])

  // Apply the pre-fix downward wording and the corrected upward suggestion
  // to real footprints rendered by tscircuit, rather than drawing a diagram.
  const wrongDirection = await renderResistors(initialY - distance)
  const fixedDirection = await renderResistors(initialY + distance)
  const courtyardOverlap = (circuitJson: typeof original) => {
    const [a, b] = circuitJson.filter(
      (element) => element.type === "pcb_courtyard_rect",
    )
    if (!a || !b) throw new Error("Expected both resistor courtyards")
    return Math.max(
      0,
      Math.min(a.center.y + a.height / 2, b.center.y + b.height / 2) -
        Math.max(a.center.y - a.height / 2, b.center.y - b.height / 2),
    )
  }
  expect(
    analyzeAllPlacements(wrongDirection).getIssues().length,
  ).toBeGreaterThan(0)
  expect(courtyardOverlap(wrongDirection)).toBeGreaterThan(
    courtyardOverlap(original),
  )
  expect(courtyardOverlap(fixedDirection)).toBeCloseTo(0)
  expect(analyzeAllPlacements(fixedDirection).getIssues()).toEqual([])

  for (const [name, circuitJson] of [
    ["overlap", original],
    ["wrong-direction", wrongDirection],
    ["fixed-direction", fixedDirection],
  ] as const) {
    await expect(
      convertCircuitJsonToPcbSvg(circuitJson, {
        showCourtyards: true,
        // Placement assertions above verify collisions; render PCB geometry only.
        shouldDrawErrors: false,
      }),
    ).toMatchSvgSnapshot(import.meta.path, name)
  }
})
