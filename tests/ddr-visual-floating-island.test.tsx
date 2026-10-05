import "bun-match-svg"
import { expect, test } from "bun:test"
import {
  ddrVisualFixture,
  plane,
  rect,
  visualSnapshot,
} from "./fixtures/ddr-visual"

test("equal GND labels do not anchor a disconnected reference island", async () => {
  const anchored = ddrVisualFixture()
  const floating = {
    ...anchored,
    json: anchored.json
      .filter(
        (e) =>
          e.type !== "pcb_copper_pour" &&
          !(e.type === "pcb_via" && e.pcb_via_id === "anchor_b"),
      )
      .map((e) =>
        e.type === "pcb_trace"
          ? {
              ...e,
              route: e.route.map((p) =>
                p.route_type === "wire" ? { ...p, x: p.x < 0 ? 1 : p.x } : p,
              ),
            }
          : e,
      ),
  }
  floating.json.push(
    plane("gnd1", "inner1", [], rect(-6, -3, 0, 3)),
    plane("island", "inner1", [], rect(0.5, -3, 6, 3)),
  )
  floating.options = {
    ...anchored.options,
    filledCopper: {
      pcbCopperPourIds: ["gnd1", "island"],
      provenance: "Two separated final-fill regions labelled GND",
    },
  }
  await expect(
    visualSnapshot([
      { title: "Before: disconnected GND island", ...floating },
      { title: "After: copper connects to ground", ...anchored },
    ]),
  ).toMatchSvgSnapshot(import.meta.path)
})
