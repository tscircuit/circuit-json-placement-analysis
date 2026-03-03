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
  const text = analysis.getString()

  expect(text).toMatchInlineSnapshot(`
    "U1.center=(0mm, 2mm) on top
    U1.bounds=(minX=-4.9mm, maxX=4.9mm, minY=-2.9mm, maxY=6.9mm)
    U1.size=(width=9.8mm, height=9.8mm)
    U1.anchor_alignment="center"
    U1 placement definition: placement_mode=none
    U1.pcbLeftEdgeX=calc(board.minX+25.1mm)
    U1.pcbBottomEdgeY=calc(board.maxY-7.1mm)
    U1.centerY=calc(board.centerY-2mm)
    U1.pcbTopEdgeY=calc(C3.minY-10mm)
    USB1.center=(-24mm, 0mm) on top
    USB1.bounds=(minX=-25.99mm, maxX=-22.01mm, minY=-2.07mm, maxY=2.07mm)
    USB1.size=(width=3.98mm, height=4.14mm)
    USB1.anchor_alignment="center"
    USB1 placement definition: placement_mode=none
    USB1.pcbLeftEdgeX=calc(board.minX+4.01mm)
    USB1.pcbTopEdgeY=calc(board.minY+11.93mm)
    USB1.centerX=calc(board.centerX-24mm)
    USB1.pcbRightEdgeX=calc(C1.minX-11mm)
    U2.center=(-10mm, -8mm) on top
    U2.bounds=(minX=-11.8mm, maxX=-8.2mm, minY=-9.3mm, maxY=-6.7mm)
    U2.size=(width=3.6mm, height=2.6mm)
    U2.anchor_alignment="center"
    U2 placement definition: placement_mode=none
    U2.pcbLeftEdgeX=calc(board.minX+18.2mm)
    U2.pcbTopEdgeY=calc(board.minY+4.7mm)
    U2.centerX=calc(board.centerX-10mm)
    U2.pcbLeftEdgeX=calc(C1.maxX+3mm)
    D1.center=(14mm, -8mm) on top
    D1.bounds=(minX=12.775mm, maxX=15.225mm, minY=-8.475mm, maxY=-7.525mm)
    D1.size=(width=2.45mm, height=0.95mm)
    D1.anchor_alignment="center"
    D1 placement definition: placement_mode=none
    D1.pcbRightEdgeX=calc(board.maxX-14.775mm)
    D1.pcbTopEdgeY=calc(board.minY+5.525mm)
    D1.centerX=calc(board.centerX+14mm)
    D1.pcbLeftEdgeX=calc(R1.maxX+4mm)
    R1.center=(10mm, -8mm) on top
    R1.bounds=(minX=9.22mm, maxX=10.78mm, minY=-8.32mm, maxY=-7.68mm)
    R1.size=(width=1.56mm, height=0.64mm)
    R1.anchor_alignment="center"
    R1 placement definition: placement_mode=none
    R1.pcbRightEdgeX=calc(board.maxX-19.22mm)
    R1.pcbTopEdgeY=calc(board.minY+5.68mm)
    R1.centerX=calc(board.centerX+10mm)
    R1.pcbRightEdgeX=calc(D1.minX-4mm)
    C1.center=(-13mm, -10mm) on top
    C1.bounds=(minX=-13.78mm, maxX=-12.22mm, minY=-10.32mm, maxY=-9.68mm)
    C1.size=(width=1.56mm, height=0.64mm)
    C1.anchor_alignment="center"
    C1 placement definition: placement_mode=none
    C1.pcbLeftEdgeX=calc(board.minX+16.22mm)
    C1.pcbTopEdgeY=calc(board.minY+3.68mm)
    C1.centerX=calc(board.centerX-13mm)
    C1.pcbRightEdgeX=calc(U2.minX-3mm)
    C2.center=(-7mm, -10mm) on top
    C2.bounds=(minX=-7.78mm, maxX=-6.22mm, minY=-10.32mm, maxY=-9.68mm)
    C2.size=(width=1.56mm, height=0.64mm)
    C2.anchor_alignment="center"
    C2 placement definition: placement_mode=none
    C2.pcbLeftEdgeX=calc(board.minX+22.22mm)
    C2.pcbTopEdgeY=calc(board.minY+3.68mm)
    C2.centerY=calc(board.centerY+10mm)
    C2.pcbLeftEdgeX=calc(U2.maxX+3mm)
    C3.center=(4mm, -8mm) on top
    C3.bounds=(minX=3.22mm, maxX=4.78mm, minY=-8.32mm, maxY=-7.68mm)
    C3.size=(width=1.56mm, height=0.64mm)
    C3.anchor_alignment="center"
    C3 placement definition: placement_mode=none
    C3.pcbRightEdgeX=calc(board.maxX-25.22mm)
    C3.pcbTopEdgeY=calc(board.minY+5.68mm)
    C3.centerY=calc(board.centerY+8mm)
    C3.pcbRightEdgeX=calc(R1.minX-6mm)
    J1.center=(24mm, 0mm) on top
    J1.bounds=(minX=23.25mm, maxX=24.75mm, minY=-12.18mm, maxY=12.18mm)
    J1.size=(width=1.5mm, height=24.36mm)
    J1.orientation=vertical
    J1.anchor_alignment="center"
    J1 placement definition: placement_mode=none
    J1.pcbRightEdgeX=calc(board.maxX-5.25mm)
    J1.pcbTopEdgeY=calc(board.minY+1.82mm)
    J1.centerX=calc(board.centerX+24mm)
    J1.pcbLeftEdgeX=calc(D1.maxX+10mm)"
  `)
})
