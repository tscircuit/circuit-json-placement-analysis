import "bun-match-svg"
import { expect, test } from "bun:test"
import { snapshotDdrStages } from "./fixtures/ddr-stages"

test("TSX continuous ground plane remains conditional screening", async () => {
  await expect(snapshotDdrStages("intact")).toMatchSvgSnapshot(import.meta.path)
})
