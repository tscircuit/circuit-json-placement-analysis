import "bun-match-svg"
import { expect, test } from "bun:test"
import { ddrVisualFixture, visualSnapshot } from "./fixtures/ddr-visual"

test("unknown stackup blocks checks; caller-selected stackup stays assumed", async () => {
  const fixture = ddrVisualFixture()
  const unknown = {
    ...fixture,
    options: { ...fixture.options, stackup: undefined },
  }
  const assumed = {
    ...fixture,
    options: {
      ...fixture.options,
      stackup: {
        ...fixture.options.stackup!,
        provenance: {
          kind: "assumed" as const,
          source: "Caller-selected generic expected stack",
        },
      },
    },
  }
  await expect(
    visualSnapshot([
      { title: "Layer count alone: reference UNKNOWN", ...unknown },
      { title: "Conditional checks: ASSUMED references", ...assumed },
    ]),
  ).toMatchSvgSnapshot(import.meta.path)
})
