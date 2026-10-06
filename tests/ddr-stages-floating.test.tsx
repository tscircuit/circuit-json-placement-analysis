import "bun-match-svg"
import { expect, test } from "bun:test"
import { snapshotDdrStages } from "./fixtures/ddr-stages"

test("TSX same-net fill without a terminal contact stays floating", async () => {
  await expect(snapshotDdrStages("floating")).toMatchSvgSnapshot(
    import.meta.path,
  )
})
