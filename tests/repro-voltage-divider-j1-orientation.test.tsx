import "bun-match-svg"
import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { stackSvgsHorizontally } from "stack-svgs"
import { analyzeAllPlacements } from "../lib/index"
import { renderVoltageDivider } from "./fixtures/voltage-divider-j1"

test("warns for J1 on shared nets and clears the warning after rotation", async () => {
  const original = await renderVoltageDivider()
  const rotated = await renderVoltageDivider(270)
  const orientationIssues = [original, rotated].map((json) =>
    analyzeAllPlacements(json)
      .getIssues()
      .filter((issue) => issue.type === "suboptimal_orientation"),
  )
  expect(orientationIssues).toMatchInlineSnapshot(`
    [
      [
        {
          "clearance": 0,
          "componentA": "J1",
          "severity": 100,
          "suggested_move": "rotate J1 180 degrees",
          "summary": "J1 connections cross the routing path between its pads",
          "type": "suboptimal_orientation",
        },
      ],
      [],
    ]
  `)
  await expect(
    stackSvgsHorizontally(
      [original, rotated].map((json) =>
        convertCircuitJsonToPcbSvg(json, { shouldDrawRatsNest: true }),
      ),
    ),
  ).toMatchSvgSnapshot(import.meta.path)
})
