// @ts-nocheck
import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { analyzeAllPlacements } from "../lib/index"

test("placement analysis includes position and size for rendered RP2040 board", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="60mm" height="28mm" routingDisabled>
      <chip
        name="U1"
        manufacturerPartNumber="RP2040"
        footprint="QFN-56"
        pcbX={0}
        pcbY={2}
        pinLabels={{
          pin1: "GPIO0",
          pin2: "GPIO1",
          pin3: "GND",
          pin4: "GPIO2",
          pin5: "GPIO3",
          pin10: "GPIO4",
          pin11: "GPIO5",
          pin12: "GPIO6",
          pin13: "GPIO7",
          pin18: "RUN",
          pin20: "XIN",
          pin21: "XOUT",
          pin23: "IOVDD",
          pin33: "DVDD",
          pin38: "GPIO25",
          pin42: "USB_DM",
          pin43: "USB_DP",
          pin52: "VREG_VOUT",
          pin53: "VREG_IN",
        }}
      />

      <chip
        name="USB1"
        footprint="dip4_w0.1in"
        manufacturerPartNumber="USB-C-BREAKOUT"
        pcbX={-24}
        pcbY={0}
        pinLabels={{
          pin1: "GND",
          pin2: "VBUS",
          pin3: "DP",
          pin4: "DM",
        }}
      />

      <chip
        name="U2"
        footprint="SOT-23-3"
        manufacturerPartNumber="AP2112K-3.3"
        pcbX={-10}
        pcbY={-8}
        pinLabels={{
          pin1: "VIN",
          pin2: "GND",
          pin3: "VOUT",
        }}
      />

      <led name="D1" color="green" footprint="0603" pcbX={14} pcbY={-8} />
      <resistor
        name="R1"
        resistance="1k"
        footprint="0402"
        pcbX={10}
        pcbY={-8}
      />

      <capacitor
        name="C1"
        capacitance="1uF"
        footprint="0402"
        pcbX={-13}
        pcbY={-10}
      />
      <capacitor
        name="C2"
        capacitance="1uF"
        footprint="0402"
        pcbX={-7}
        pcbY={-10}
      />
      <capacitor
        name="C3"
        capacitance="100nF"
        footprint="0402"
        pcbX={4}
        pcbY={-8}
      />

      <pinheader
        name="J1"
        footprint="pinrow10"
        pinCount={10}
        gender="female"
        pcbX={24}
        pcbY={0}
        pcbRotation={90}
        pinLabels={{
          pin1: "GND",
          pin2: "3V3",
          pin3: "GPIO0",
          pin4: "GPIO1",
          pin5: "GPIO2",
          pin6: "GPIO3",
          pin7: "GPIO4",
          pin8: "GPIO5",
          pin9: "GPIO6",
          pin10: "GPIO7",
        }}
      />

      <trace from=".USB1 > .VBUS" to=".U2 > .VIN" />
      <trace from=".USB1 > .GND" to="net.GND" />
      <trace from=".USB1 > .DP" to=".U1 > .USB_DP" />
      <trace from=".USB1 > .DM" to=".U1 > .USB_DM" />

      <trace from=".U2 > .GND" to="net.GND" />
      <trace from=".U2 > .VOUT" to="net.V3_3" />
      <trace from=".C1 > .pin1" to=".U2 > .VIN" />
      <trace from=".C1 > .pin2" to="net.GND" />
      <trace from=".C2 > .pin1" to=".U2 > .VOUT" />
      <trace from=".C2 > .pin2" to="net.GND" />

      <trace from=".U1 > .IOVDD" to="net.V3_3" />
      <trace from=".U1 > .DVDD" to="net.V3_3" />
      <trace from=".U1 > .RUN" to="net.V3_3" />
      <trace from=".U1 > .GND" to="net.GND" />
      <trace from=".C3 > .pin1" to="net.V3_3" />
      <trace from=".C3 > .pin2" to="net.GND" />

      <trace from=".U1 > .GPIO25" to=".R1 > .pin1" />
      <trace from=".R1 > .pin2" to=".D1 > .anode" />
      <trace from=".D1 > .cathode" to="net.GND" />

      <trace from=".J1 > .GND" to="net.GND" />
      <trace from=".J1 > .3V3" to="net.V3_3" />
      <trace from=".J1 > .GPIO0" to=".U1 > .GPIO0" />
      <trace from=".J1 > .GPIO1" to=".U1 > .GPIO1" />
      <trace from=".J1 > .GPIO2" to=".U1 > .GPIO2" />
      <trace from=".J1 > .GPIO3" to=".U1 > .GPIO3" />
      <trace from=".J1 > .GPIO4" to=".U1 > .GPIO4" />
      <trace from=".J1 > .GPIO5" to=".U1 > .GPIO5" />
      <trace from=".J1 > .GPIO6" to=".U1 > .GPIO6" />
      <trace from=".J1 > .GPIO7" to=".U1 > .GPIO7" />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const analysis = analyzeAllPlacements(circuitJson)

  expect(analysis.getString()).toMatchInlineSnapshot(`
    "placement summary: no placement issues

    board-edge status:
    - U1: 7.1mm inside bottom edge
    - USB1: 4.01mm inside left edge
    - U2: 4.7mm inside top edge
    - D1: 5.525mm inside top edge
    - R1: 5.68mm inside top edge
    - C1: 3.68mm inside top edge
    - C2: 3.68mm inside top edge
    - C3: 5.68mm inside top edge
    - J1: 1.82mm inside top edge"
  `)
})
