import "bun-match-svg"
import { expect, test } from "bun:test"
import {
  ddrVisualFixture,
  groundVia,
  plane,
  rect,
  visualSnapshot,
} from "./fixtures/ddr-visual"

test("a layer hop requires an existing via with both span and copper contact", async () => {
  const missing = ddrVisualFixture(true)
  const wrongSpan = {
    ...missing,
    json: [
      ...missing.json,
      groundVia("return_via", 0, -0.8, ["top", "inner1"]),
    ],
  }
  const valid = {
    ...missing,
    json: [
      ...missing.json,
      groundVia("return_via", 0, -0.8, missing.options.stackup!.copperLayers),
    ],
  }
  const insulated = {
    ...valid,
    json: valid.json.map((e) =>
      e.type === "pcb_copper_pour" && e.layer === "inner4"
        ? plane("gnd4", "inner4", [
            rect(-0.3, -0.3, 0.3, 0.3),
            rect(-0.5, -1.3, 0.5, -0.4),
          ])
        : e,
    ),
  }
  await expect(
    visualSnapshot([
      { title: "No ground bridge at the signal hop", ...missing },
      { title: "Ground via stops before inner4", ...wrongSpan },
      { title: "Full-span via insulated from inner4", ...insulated },
      { title: "Existing via contacts both GND planes", ...valid },
    ]),
  ).toMatchSvgSnapshot(import.meta.path)
})
