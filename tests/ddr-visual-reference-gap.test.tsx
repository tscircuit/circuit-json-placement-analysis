import "bun-match-svg"
import { expect, test } from "bun:test"
import {
  ddrVisualFixture,
  groundVia,
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
      groundVia("return_via", 0, -0.8, hop.options.stackup!.copperLayers),
    ],
  }
  await expect(
    visualSnapshot([
      { title: "Intact broad GND plane", ...intact },
      { title: "DQ0 crosses a 0.6 mm copper slit", ...gap },
      { title: "Signal clearance opens to reference edge", ...edgeOpen },
    ]),
  ).toMatchSvgSnapshot(import.meta.path)
})
