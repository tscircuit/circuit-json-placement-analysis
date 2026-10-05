import "bun-match-svg"
import { expect, test } from "bun:test"
import { ddrVisualFixture, visualSnapshot } from "./fixtures/ddr-visual"

test("invalid coordinates and unsupported curved fill remain unknown", async () => {
  const fixture = ddrVisualFixture()
  const invalid = {
    ...fixture,
    json: fixture.json.map((e) =>
      e.type === "pcb_trace"
        ? {
            ...e,
            route: e.route.map((p, i) =>
              i === 1 ? { ...p, x: Number.POSITIVE_INFINITY } : p,
            ),
          }
        : e,
    ),
  }
  const invalidWidth = {
    ...fixture,
    json: fixture.json.map((e) =>
      e.type === "pcb_trace"
        ? {
            ...e,
            route: e.route.map((p) =>
              p.route_type === "wire" ? { ...p, width: Number.NaN } : p,
            ),
          }
        : e,
    ),
  }
  const curved = {
    ...fixture,
    json: fixture.json.map((e) =>
      e.type === "pcb_copper_pour" && e.shape === "brep"
        ? {
            ...e,
            brep_shape: {
              ...e.brep_shape,
              outer_ring: {
                vertices: e.brep_shape.outer_ring.vertices.map((p, i) =>
                  i === 0 ? { ...p, bulge: 0.4 } : p,
                ),
              },
            },
          }
        : e,
    ),
  }
  await expect(
    visualSnapshot([
      { title: "Invalid coordinate: x = Infinity", ...invalid },
      { title: "Invalid width: NaN", ...invalidWidth },
      { title: "Unsupported curve", ...curved },
    ]),
  ).toMatchSvgSnapshot(import.meta.path)
})
