// @ts-nocheck
import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { analyzeAllPlacements } from "../lib/index"

test("placement analysis summarizes overlaps, connector intrusions, clusters, and machine-readable issues", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <chip
        name="USB1"
        footprint="dip4_w0.1in"
        manufacturerPartNumber="USB-C-BREAKOUT"
        pcbX={-7}
        pcbY={0}
        pinLabels={{
          pin1: "GND",
          pin2: "VBUS",
          pin3: "DP",
          pin4: "DM",
        }}
      />

      <capacitor
        name="C1"
        capacitance="1uF"
        footprint="0603"
        pcbX={-6.7}
        pcbY={0}
      />

      <resistor
        name="R1"
        resistance="1k"
        footprint="0603"
        pcbX={-6.6}
        pcbY={0.4}
      />

      <resistor
        name="R2"
        resistance="1k"
        footprint="0603"
        pcbX={-6.6}
        pcbY={0.4}
      />

      <pinheader
        name="J1"
        footprint="pinrow2"
        pinCount={2}
        gender="female"
        pcbX={9.7}
        pcbY={0}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const analysis = analyzeAllPlacements(circuit.getCircuitJson())
  const report = analysis.getReport()
  const text = analysis.getString()

  expect(report.summary.countsByType.pad_overlap).toBeGreaterThan(0)
  expect(report.summary.countsByType.off_board).toBe(1)
  expect(report.summary.countsByType.connector_body_intrusion).toBeGreaterThan(
    0,
  )
  expect(report.summary.likelyBadClusters).toEqual([
    expect.objectContaining({
      clusterName: "USB cluster",
      componentNames: expect.arrayContaining(["USB1", "C1", "R1", "R2"]),
    }),
  ])

  expect(report.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "pad_overlap",
        componentA: "R1",
        componentB: "R2",
        suggested_move: "move R2 0.8mm right",
      }),
      expect.objectContaining({
        type: "off_board",
        componentA: "J1",
      }),
      expect.objectContaining({
        type: "connector_body_intrusion",
        componentA: "C1",
        componentB: "USB1",
      }),
    ]),
  )

  expect(text).toContain(
    "placement summary: 6 pad overlaps, 1 off-board, 3 connector-body intrusions",
  )
  expect(text).toContain("likely bad clusters:")
  expect(text).toContain("- USB cluster: USB1, R1, R2, C1")
})
