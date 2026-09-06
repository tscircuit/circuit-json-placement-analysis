import { expect, test } from "bun:test"
import { analyzeAllPlacements } from "../lib/index"
import { fixture } from "./fixtures/overlapping-circular-courtyards"

test("overlapping circular courtyards report one collision", () => {
  const collisions = analyzeAllPlacements(fixture)
    .getIssues()
    .filter((issue) => issue.type === "courtyard_collision")
  expect(collisions).toHaveLength(1)
})
