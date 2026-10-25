import "bun-match-svg"
import { expect, test } from "bun:test"
import { snapshotDdrStages } from "./fixtures/ddr-stages"

test("TSX signal hop lacks a nearby ground bridge", async () => {
  await expect(snapshotDdrStages("missing-return")).toMatchSvgSnapshot(
    import.meta.path,
  )
})
