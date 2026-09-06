import "bun-match-svg"
import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { stackSvgsHorizontally } from "stack-svgs"
import { analyzeAllPlacements } from "../lib/index"
import { renderVoltageDivider } from "./fixtures/voltage-divider-j1"

test("reproduces missing J1 warning despite crossed VIN/GND placement", async () => {
  const original = await renderVoltageDivider()
  const rotated = await renderVoltageDivider(270)
  for (const json of [original, rotated]) {
    const orientationIssues = analyzeAllPlacements(json)
      .getIssues()
      .filter((issue) => issue.type === "suboptimal_orientation")
    expect(orientationIssues).toEqual([])
  }
  await expect(
    stackSvgsHorizontally(
      [original, rotated].map((json) =>
        convertCircuitJsonToPcbSvg(json, { shouldDrawRatsNest: true }),
      ),
    ),
  ).toMatchSvgSnapshot(import.meta.path)
})
