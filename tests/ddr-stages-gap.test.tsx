import "bun-match-svg"
import { expect, test } from "bun:test"
import { snapshotDdrStages } from "./fixtures/ddr-stages"

test("TSX split fill reveals its actual gap during coverage checking", async () => {
  await expect(snapshotDdrStages("gap")).toMatchSvgSnapshot(import.meta.path)
})
