import "bun-match-svg"
import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { stackSvgsVertically } from "stack-svgs"
import { analyzeAllPlacements } from "../lib/index"
import { renderVoltageDivider } from "./fixtures/voltage-divider-j1"

test("reproduces missing J1 warning despite crossed VIN/GND placement", async () => {
  const original = await renderVoltageDivider()
  const orientationIssues = analyzeAllPlacements(original)
    .getIssues()
    .filter((issue) => issue.type === "suboptimal_orientation")
  expect(orientationIssues).toEqual([])

  const hasPlacementError = orientationIssues.some(
    (issue) => issue.componentA === "J1",
  )
  const statusColor = hasPlacementError ? "#ef4444" : "#3b82f6"
  const statusText = hasPlacementError
    ? "Placement error: rotate J1 180 degrees"
    : "No placement errors reported for J1"
  const statusSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="90">
    <rect width="800" height="90" fill="#101827" />
    <text x="24" y="35" fill="white" font-family="sans-serif" font-size="20">Voltage divider — crossing J1 connections</text>
    <text x="24" y="68" fill="${statusColor}" font-family="sans-serif" font-size="22">${statusText}</text>
  </svg>`
  await expect(
    stackSvgsVertically([
      statusSvg,
      convertCircuitJsonToPcbSvg(original, { shouldDrawRatsNest: true }),
    ]),
  ).toMatchSvgSnapshot(import.meta.path)
})
