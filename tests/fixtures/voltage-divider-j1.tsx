import type { AnyCircuitElement } from "circuit-json"
import { Circuit } from "tscircuit"

// Reconstructed from the screenshot, not the original circuit source.
// Routing is disabled to isolate placement analysis from autorouter decisions.
export const renderVoltageDivider = async (
  j1Rotation = 90,
): Promise<AnyCircuitElement[]> => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm" routingDisabled>
      <pinheader
        name="J1"
        pinCount={2}
        footprint="pinrow2"
        pcbX={-12}
        pcbY={0}
        pcbRotation={j1Rotation}
        pinLabels={["VIN", "GND"]}
      />
      <pinheader
        name="J2"
        pinCount={2}
        footprint="pinrow2"
        pcbX={12}
        pcbY={0}
        pcbRotation={90}
        pinLabels={["VOUT", "GND"]}
      />
      <resistor
        name="R1"
        resistance="10k"
        footprint="0603"
        pcbX={-4}
        pcbY={3}
      />
      <resistor
        name="R2"
        resistance="10k"
        footprint="0603"
        pcbX={4}
        pcbY={-2}
      />
      <testpoint
        name="TP1"
        footprintVariant="pad"
        padDiameter="1.5mm"
        pcbX={2}
        pcbY={4}
      />
      <testpoint
        name="TP2"
        footprintVariant="pad"
        padDiameter="1.5mm"
        pcbX={2}
        pcbY={-5}
      />
      <trace from=".J1 > .pin1" to="net.VIN" />
      <trace from=".R1 > .pin1" to="net.VIN" />
      <trace from=".R1 > .pin2" to="net.VOUT" />
      <trace from=".R2 > .pin1" to="net.VOUT" />
      <trace from=".J2 > .pin1" to="net.VOUT" />
      <trace from=".TP1 > .pin1" to="net.VOUT" />
      <trace from=".J1 > .pin2" to="net.GND" />
      <trace from=".R2 > .pin2" to="net.GND" />
      <trace from=".J2 > .pin2" to="net.GND" />
      <trace from=".TP2 > .pin1" to="net.GND" />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}
