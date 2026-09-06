import "bun-match-svg"
import { expect, test } from "bun:test"
import { analyzeAllPlacements } from "../lib/index"

import { fixture } from "./fixtures/overlapping-circular-courtyards"

const escapeXml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

// Render the fixture geometry directly, then label it with the actual report.
// Nothing moves between the failing and fixed snapshots.
const renderFixture = (reportText: string, collisionCount: number): string => {
  const board = fixture.find((item) => item.type === "pcb_board")!
  const shapes: string[] = []
  for (const item of fixture) {
    if (item.type !== "pcb_component" && item.type !== "pcb_courtyard_circle")
      continue
    const center = item.center as { x: number; y: number }
    if (item.type === "pcb_courtyard_circle") {
      shapes.push(
        `<circle cx="${center.x}" cy="${-center.y}" r="${item.radius}" fill="#38bdf8" fill-opacity="0.18" stroke="#0284c7" stroke-width="0.05"/>`,
      )
    } else {
      const width = item.width as number
      const height = item.height as number
      const source = fixture.find(
        (candidate) =>
          candidate.type === "source_component" &&
          candidate.source_component_id === item.source_component_id,
      )!
      shapes.push(
        `<rect x="${center.x - width / 2}" y="${-center.y - height / 2}" width="${width}" height="${height}" fill="#475569"/>`,
        `<text x="${center.x}" y="${-center.y + 0.1}" fill="white" text-anchor="middle" font-size="0.3">${escapeXml(String(source.name))}</text>`,
      )
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="600" viewBox="-6.5 -6 13 11" font-family="sans-serif">
<rect x="-6.5" y="-6" width="13" height="11" fill="white"/>
<text x="-6" y="-5.35" font-size="0.35" fill="#0f172a">${escapeXml(reportText.split("\n")[0]!)}</text>
<text x="-6" y="-4.7" font-size="0.3" fill="#334155">Courtyard collisions reported: ${collisionCount}</text>
<rect x="${-(board.width as number) / 2}" y="${-(board.height as number) / 2}" width="${board.width}" height="${board.height}" fill="#f8fafc" stroke="#64748b" stroke-width="0.04"/>
${shapes.join("\n")}
<text x="-5.8" y="3.5" font-size="0.27" fill="#334155">Two 2 mm radius courtyards; centers 3 mm apart; physical overlap 1 mm.</text>
<text x="-5.8" y="4.55" font-size="0.27" fill="#334155">Same geometry before and after the reporting fix.</text>
</svg>`
}

test("repro: overlapping circular courtyards must appear in the placement report", async () => {
  const analysis = analyzeAllPlacements(fixture)
  const reportText = analysis.getString()
  const courtyardCollisions = analysis
    .getIssues()
    .filter((issue) => issue.type === "courtyard_collision")

  // Record the actual bad baseline or fixed output.
  expect(reportText).toMatchSnapshot("actual placement report")
  await expect(
    renderFixture(reportText, courtyardCollisions.length),
  ).toMatchSvgSnapshot(import.meta.path)
})
