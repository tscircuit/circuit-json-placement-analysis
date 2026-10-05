import "bun-match-svg"
import { expect, test } from "bun:test"
import {
  ddrVisualFixture,
  groundVia,
  layers,
  plane,
  rect,
  visualSnapshot,
} from "./fixtures/ddr-visual"

test("intact reference, a slit, and an edge-open signal clearance", async () => {
  const intact = ddrVisualFixture()
  const gap = {
    ...intact,
    json: intact.json.map((e) =>
      e.type === "pcb_copper_pour"
        ? plane("gnd1", "inner1", [rect(-0.3, -2.8, 0.3, 2.8)])
        : e,
    ),
  }
  const hop = ddrVisualFixture(true)
  const edgeOpen = {
    ...hop,
    json: [
      ...hop.json.map((e) =>
        e.type === "pcb_copper_pour" && e.pcb_copper_pour_id === "gnd1"
          ? plane(
              "gnd1",
              "inner1",
              [rect(-0.3, -0.3, 0.3, 0.3)],
              rect(-6, -3, 0.3, 3),
            )
          : e,
      ),
      groundVia("return_via", 0, -0.8, layers),
    ],
  }
  await expect(
    visualSnapshot([
      { title: "Before: slit under the signal", ...gap },
      { title: "After: continuous GND copper", ...intact },
      { title: "Edge case: clearance opens to plane edge", ...edgeOpen },
    ]),
  ).toMatchSvgSnapshot(import.meta.path)
})
