import "bun-match-svg"
import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { Circuit } from "tscircuit"
import { analyzeAllPlacements } from "../lib"
import fixture from "./assets/vertical-directions.circuit.json"

test("repro: vertical separation suggestion and nearest board edge", () => {
  const analysis = analyzeAllPlacements(fixture)
  expect(analysis.getIssues()[0]!.suggested_move).toMatchInlineSnapshot(
    `"move R2 0.8mm up"`,
  )
  expect(
    analysis.getReport().components[1]!.boardEdgeStatus,
  ).toMatchInlineSnapshot(`
    {
      "component_name": "R2",
      "distance": 2.8,
      "edge": "top",
      "status": "inside",
    }
  `)
})

const renderResistors = async (r2Y: number) => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm" routingDisabled>
      <resistor name="R1" resistance="1k" footprint="0805" pcbX={0} pcbY={0} />
      <resistor
        name="R2"
        resistance="1k"
        footprint="0805"
        pcbX={0}
        pcbY={r2Y}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}

const getCourtyardOverlap = (
  circuitJson: Awaited<ReturnType<typeof renderResistors>>,
) => {
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

test("repro: PCB before and after applying the reported vertical move", async () => {
  const initialY = 1.6
  const original = await renderResistors(initialY)
  const issue = analyzeAllPlacements(original)
    .getIssues()
    .find((issue) => issue.type === "courtyard_collision")!
  expect(issue).toBeDefined()
  expect(issue.suggested_move).toMatchInlineSnapshot(`"move R2 0.3mm up"`)
  const match = /^move R2 ([\d.]+)mm (up|down)$/.exec(issue.suggested_move!)
  expect(match).not.toBeNull()
  const distance = Number(match![1])
  const moved = await renderResistors(
    initialY + (match![2] === "up" ? distance : -distance),
  )
  expect(analyzeAllPlacements(moved).getIssues()).toEqual([])
  // Keep the applied-move outcome alongside the rendered PCB regression.
  expect({
    originalOverlap: Number(getCourtyardOverlap(original).toFixed(3)),
    overlapAfterSuggestedMove: Number(getCourtyardOverlap(moved).toFixed(3)),
  }).toMatchInlineSnapshot(`
    {
      "originalOverlap": 0.3,
      "overlapAfterSuggestedMove": 0,
    }
  `)

  for (const [name, circuitJson] of [
    ["original", original],
    ["suggested-move", moved],
  ] as const) {
    await expect(
      convertCircuitJsonToPcbSvg(circuitJson, {
        showCourtyards: true,
        shouldDrawErrors: false,
      }),
    ).toMatchSvgSnapshot(import.meta.path, name)
  }
})
