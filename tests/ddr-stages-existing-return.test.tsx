import "bun-match-svg"
import { expect, test } from "bun:test"
import { snapshotDdrStages } from "./fixtures/ddr-stages"

test("TSX ground via contacts both reference planes at the signal hop", async () => {
  await expect(snapshotDdrStages("existing-return")).toMatchSvgSnapshot(
    import.meta.path,
  )
})
