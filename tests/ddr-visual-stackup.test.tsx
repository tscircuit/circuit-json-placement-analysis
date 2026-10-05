import "bun-match-svg"
import { expect, test } from "bun:test"
import { ddrVisualFixture, visualSnapshot } from "./fixtures/ddr-visual"

test("FR4 alone does not establish references; layer-based screening stays assumed", async () => {
  const fixture = ddrVisualFixture()
  const unknown = {
    json: fixture.json.map((e) =>
      e.type === "pcb_board" ? { ...e, num_layers: Number.NaN } : e,
    ),
  }
  const roleUnknown = {
    json: fixture.json.map((e) =>
      e.type === "source_net"
        ? { ...e, is_ground: undefined, is_power: undefined }
        : e,
    ),
  }
  await expect(
    visualSnapshot([
      { title: "FR4 without a usable layer count", ...unknown },
      { title: "Assumed six-layer reference screening", ...fixture },
      { title: "GND label without an electrical role", ...roleUnknown },
    ]),
  ).toMatchSvgSnapshot(import.meta.path)
})
