import "bun-match-svg"
import { expect, test } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { stackSvgsVertically } from "stack-svgs"
import { Circuit } from "tscircuit"
import { analyzeAllPlacements } from "../lib/index"

// TI DRV8833RTYR, WQFN-16 pinout: https://www.ti.com/lit/ds/symlink/drv8833.pdf
// Placement-only fixture: test points represent external net destinations.
const pins = [
  "AISEN",
  "AOUT2",
  "BOUT2",
  "BISEN",
  "BOUT1",
  "nFAULT",
  "BIN1",
  "BIN2",
  "VCP",
  "VM",
  "GND",
  "VINT",
  "AIN2",
  "AIN1",
  "nSLEEP",
  "AOUT1",
]
const targets = [
  { x: 10, y: -4.5 },
  { x: 10, y: -1.5 },
  { x: 10, y: 1.5 },
  { x: 10, y: 4.5 },
  { x: 4.5, y: 10 },
  { x: 1.5, y: 10 },
  { x: -1.5, y: 10 },
  { x: -4.5, y: 10 },
  { x: -10, y: 4.5 },
  { x: -10, y: 1.5 },
  { x: -10, y: -1.5 },
  { x: -10, y: -4.5 },
  { x: -4.5, y: -10 },
  { x: -1.5, y: -10 },
  { x: 1.5, y: -10 },
  { x: 4.5, y: -10 },
]

const renderDrv8833 = async (
  pcbRotation: number,
): Promise<AnyCircuitElement[]> => {
  const circuit = new Circuit()
  circuit.add(
    <board width="28mm" height="28mm" routingDisabled schematicDisabled>
      <chip
        name="U1"
        manufacturerPartNumber="DRV8833RTYR"
        footprint="qfn16_w4_h4_p0.65_thermalpad"
        pinLabels={{
          ...Object.fromEntries(pins.map((name, i) => [`pin${i + 1}`, name])),
          pin17: ["EP", "thermalpad"],
        }}
        internallyConnectedPins={[["pin11", "pin17"]]}
        pcbX={0}
        pcbY={0}
        pcbRotation={pcbRotation}
      />
      <trace from=".U1 > .EP" to="net.GND" />
      {pins.map((name, i) => (
        <testpoint
          key={name}
          name={`TP_${name}`}
          footprintVariant="pad"
          pcbX={targets[i]!.x}
          pcbY={targets[i]!.y}
        />
      ))}
      {pins.map((name) => (
        <trace from={`.U1 > .${name}`} to={`net.${name}`} />
      ))}
      {pins.map((name) => (
        <trace from={`.TP_${name} > .pin1`} to={`net.${name}`} />
      ))}
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}

// Remove .failing when orientation analysis supports multi-pin ICs.
test.failing("DRV8833RTYR should report a beneficial 180-degree rotation", async () => {
  const original = await renderDrv8833(0)
  const rotated = await renderDrv8833(180)
  const chip = original.find(
    (e) => e.type === "source_component" && e.name === "U1",
  )!
  if (chip.type !== "source_component") throw new Error("Missing DRV8833RTYR")
  const ports = original.filter(
    (e) =>
      e.type === "source_port" &&
      e.source_component_id === chip.source_component_id,
  )
  expect(ports).toHaveLength(17)
  for (const port of ports) {
    if (port.type !== "source_port") throw new Error("Missing source port")
    const before = original.find(
      (e) => e.type === "pcb_port" && e.source_port_id === port.source_port_id,
    )!
    const after = rotated.find(
      (e) => e.type === "pcb_port" && e.source_port_id === port.source_port_id,
    )!
    if (before.type !== "pcb_port" || after.type !== "pcb_port") {
      throw new Error("Missing PCB port")
    }
    if (port.pin_number === 17) {
      expect(after.x).toBeCloseTo(before.x)
      expect(after.y).toBeCloseTo(before.y)
      continue
    }
    const target = targets[port.pin_number! - 1]!
    expect(Math.hypot(after.x - target.x, after.y - target.y)).toBeLessThan(
      Math.hypot(before.x - target.x, before.y - target.y),
    )
  }
  expect(
    analyzeAllPlacements(rotated)
      .getIssues()
      .filter((issue) => issue.type === "suboptimal_orientation"),
  ).toEqual([])
  const issues = analyzeAllPlacements(original)
    .getIssues()
    .filter(
      (issue) =>
        issue.type === "suboptimal_orientation" && issue.componentA === "U1",
    )
  const hasWarning = issues.length > 0
  const status = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="90">
    <rect width="800" height="90" fill="#101827" />
    <text x="24" y="35" fill="white" font-family="sans-serif" font-size="22">DRV8833RTYR — WQFN-16 motor driver + exposed pad</text>
    <text x="24" y="68" fill="${hasWarning ? "#3b82f6" : "#ef4444"}" font-family="sans-serif" font-size="20">${hasWarning ? "Detected: rotate U1 180 degrees" : "Missing orientation warning for U1 (16 pins + EP)"}</text>
  </svg>`
  await expect(
    stackSvgsVertically([
      status,
      convertCircuitJsonToPcbSvg(original, { shouldDrawRatsNest: true }),
    ]),
  ).toMatchSvgSnapshot(import.meta.path)
  expect(issues).toContainEqual(
    expect.objectContaining({
      componentA: "U1",
      suggested_move: "rotate U1 180 degrees",
    }),
  )
})
