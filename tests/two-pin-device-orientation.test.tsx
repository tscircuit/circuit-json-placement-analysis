import "bun-match-svg"
import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { stackSvgsVertically } from "stack-svgs"
import { Circuit } from "tscircuit"
import { analyzeAllPlacements } from "../lib/index"

type DeviceKind = "resistor" | "capacitor" | "inductor" | "crystal" | "diode"

const renderDevice = async (
  kind: DeviceKind,
  pcbRotation: number,
): Promise<AnyCircuitElement[]> => {
  const circuit = new Circuit()
  const devices = {
    resistor: (
      <resistor
        name="R1"
        resistance="10k"
        footprint="0603"
        pcbRotation={pcbRotation}
      />
    ),
    capacitor: (
      <capacitor
        name="C1"
        capacitance="10nF"
        footprint="0603"
        pcbRotation={pcbRotation}
      />
    ),
    inductor: (
      <inductor
        name="L1"
        inductance="10uH"
        footprint="0805"
        pcbRotation={pcbRotation}
      />
    ),
    crystal: (
      <crystal
        name="Y1"
        frequency="16MHz"
        loadCapacitance="18pF"
        footprint="hc49"
        pcbRotation={pcbRotation}
      />
    ),
    diode: <diode name="D1" footprint="sod123" pcbRotation={pcbRotation} />,
  }
  const device = devices[kind]
  circuit.add(
    <board width="36mm" height="14mm" routingDisabled>
      {device}
      <testpoint
        name="TP_RIGHT"
        footprintVariant="pad"
        pcbX={11}
        pcbY={2}
      />
      <testpoint
        name="TP_RIGHT_ALT"
        footprintVariant="pad"
        pcbX={15}
        pcbY={2}
      />
      <testpoint
        name="TP_LEFT"
        footprintVariant="pad"
        pcbX={-11}
        pcbY={-2}
      />
      <testpoint
        name="TP_LEFT_ALT"
        footprintVariant="pad"
        pcbX={-15}
        pcbY={-2}
      />
      <trace from={`.${device.props.name} > .pin1`} to="net.A" />
      <trace from=".TP_RIGHT > .pin1" to="net.A" />
      <trace from=".TP_RIGHT_ALT > .pin1" to="net.A" />
      <trace from={`.${device.props.name} > .pin2`} to="net.B" />
      <trace from=".TP_LEFT > .pin1" to="net.B" />
      <trace from=".TP_LEFT_ALT > .pin1" to="net.B" />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}

test("two-pin devices on shared nets warn before rotation and clear afterward", async () => {
  const names: Record<DeviceKind, string> = {
    resistor: "R1",
    capacitor: "C1",
    inductor: "L1",
    crystal: "Y1",
    diode: "D1",
  }
  for (const kind of Object.keys(names) as DeviceKind[]) {
    const original = await renderDevice(kind, 0)
    const issues = analyzeAllPlacements(original)
      .getIssues()
      .filter((issue) => issue.type === "suboptimal_orientation")
    expect(issues).toEqual([
      {
        type: "suboptimal_orientation",
        componentA: names[kind],
        clearance: 0,
        severity: 100,
        summary: `${names[kind]} connections cross the routing path between its pads`,
        suggested_move: `rotate ${names[kind]} 180 degrees`,
      },
    ])
    const status = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="60">
      <rect width="800" height="60" fill="#101827" />
      <text x="24" y="38" fill="#3b82f6" font-family="sans-serif" font-size="22">Detected orientation issue: ${issues[0]!.suggested_move}</text>
    </svg>`
    await expect(
      stackSvgsVertically([
        status,
        convertCircuitJsonToPcbSvg(original, { shouldDrawRatsNest: true }),
      ]),
    ).toMatchSvgSnapshot(import.meta.path, kind)
    if (kind === "resistor") {
      // Use a non-connector designator to ensure type, not name, excludes
      // pin headers, connectors, and legacy jumpers serialized as chips.
      for (const ftype of [
        "simple_pin_header",
        "simple_connector",
        "simple_chip",
      ]) {
        const interfaceJson = original.map((element) =>
          element.type === "source_component" && element.name === "R1"
            ? { ...element, ftype }
            : element,
        )
        expect(
          analyzeAllPlacements(interfaceJson)
            .getIssues()
            .filter((issue) => issue.type === "suboptimal_orientation"),
        ).toEqual([])
      }
    }
    const rotated = await renderDevice(kind, 180)
    expect(
      analyzeAllPlacements(rotated)
        .getIssues()
        .filter((issue) => issue.type === "suboptimal_orientation"),
    ).toEqual([])
  }
})
