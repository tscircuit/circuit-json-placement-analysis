import "bun-match-svg"
import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { analyzeAllPlacements } from "../lib/index"
import reproCircuitJson from "./assets/repro-c1526234-rotated-component-bounds.json"

test("clear courtyards suppress stale rotated component bounds intrusion", async () => {
  const circuitJson = reproCircuitJson as AnyCircuitElement[]
  const analysis = analyzeAllPlacements(circuitJson)

  expect(analysis.getIssues()).toEqual([])
  expect(analysis.getString()).toContain(
    "placement summary: no placement issues",
  )

  await expect(
    convertCircuitJsonToPcbSvg(
      circuitJson.filter((element) => element.type !== "pcb_board"),
      { showCourtyards: true, shouldDrawErrors: true },
    ),
  ).toMatchSvgSnapshot(import.meta.path)
})
