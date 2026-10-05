import "bun-match-svg"
import { expect, test } from "bun:test"
import { readFileSync, writeFileSync } from "node:fs"
import type { AnyCircuitElement, PcbPort } from "circuit-json"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { stackSvgsVertically } from "stack-svgs"
import { Circuit } from "tscircuit"
import { analyzeDdrPlacement, type DdrPlacementOptions } from "../lib"
import { fill, fixtureElement, rectPoints, via } from "./fixtures/ddr"

// Original generic two-ball footprint. No private board or vendor model is embedded.
const Package = () => (
  <footprint>
    <smtpad
      shape="circle"
      radius={0.25}
      pcbX={0}
      pcbY={0}
      portHints={["pin1"]}
    />
    <smtpad
      shape="circle"
      radius={0.25}
      pcbX={0}
      pcbY={1}
      portHints={["pin2"]}
    />
    <silkscreenrect width={2} height={3} pcbY={0.5} />
  </footprint>
)

const renderedFixture = async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={20} height={10} layers={6} routingDisabled schematicDisabled>
      <chip
        name="U1"
        pcbX={-8}
        pinLabels={{ pin1: "DQ0", pin2: "GND" }}
        footprint={<Package />}
      />
      <chip
        name="U2"
        pcbX={8}
        pinLabels={{ pin1: "DQ0", pin2: "GND" }}
        footprint={<Package />}
      />
      <trace from=".U1 > .DQ0" to=".U2 > .DQ0" />
      <trace from=".U1 > .DQ0" to="net.DDR_D0" />
      <net name="GND" isGroundNet />
      <trace from=".U1 > .GND" to="net.GND" />
      <trace from=".U2 > .GND" to="net.GND" />
      <pcbnotetext
        pcbX={0}
        pcbY={3.5}
        text="Generic DDR DQ0: inner1 reference / top-to-bottom hop"
        fontSize={0.55}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const rendered = circuit.getCircuitJson()
  const component = (name: string) =>
    rendered.find((e) => e.type === "source_component" && e.name === name)!
  const port = (name: string, pin: number): PcbPort => {
    const chip = component(name)
    if (chip.type !== "source_component") throw new Error("Missing chip")
    const source = rendered.find(
      (e) =>
        e.type === "source_port" &&
        e.source_component_id === chip.source_component_id &&
        e.pin_number === pin,
    )
    if (source?.type !== "source_port") throw new Error("Missing source pin")
    const pcb = rendered.find(
      (e) =>
        e.type === "pcb_port" && e.source_port_id === source.source_port_id,
    )
    if (pcb?.type !== "pcb_port") throw new Error("Missing PCB pin")
    return pcb
  }
  const a = port("U1", 1)
  const b = port("U2", 1)
  const ag = port("U1", 2)
  const bg = port("U2", 2)
  const source = rendered.find(
    (e) =>
      e.type === "source_trace" &&
      e.connected_source_port_ids.includes(a.source_port_id) &&
      e.connected_source_port_ids.includes(b.source_port_id),
  )
  const ground = rendered.find(
    (e) => e.type === "source_net" && e.name === "GND",
  )
  if (source?.type !== "source_trace" || ground?.type !== "source_net")
    throw new Error("Missing rendered source connectivity")
  const ddrNet = rendered.find(
    (e) => e.type === "source_net" && e.name === "DDR_D0",
  )
  if (ddrNet?.type !== "source_net") throw new Error("Missing DDR net")
  const stack = ["top", "inner1", "inner2", "inner3", "inner4", "bottom"]
  // Import an explicitly routed final PCB result through canonical Circuit JSON elements.
  // U2 stays on top: include the final BGA entry via, after the bottom-layer main route.
  const route = fixtureElement({
    type: "pcb_trace",
    pcb_trace_id: "generic_ddr_route",
    source_trace_id: source.source_trace_id,
    route: [
      {
        route_type: "wire",
        x: a.x,
        y: a.y,
        width: 0.15,
        layer: "top",
        start_pcb_port_id: a.pcb_port_id,
      },
      { route_type: "via", x: 0, y: 0, from_layer: "top", to_layer: "bottom" },
      {
        route_type: "wire",
        x: b.x - 0.5,
        y: b.y,
        width: 0.15,
        layer: "bottom",
      },
      {
        route_type: "via",
        x: b.x - 0.5,
        y: b.y,
        from_layer: "bottom",
        to_layer: "top",
      },
      {
        route_type: "wire",
        x: b.x,
        y: b.y,
        width: 0.15,
        layer: "top",
        end_pcb_port_id: b.pcb_port_id,
      },
    ],
  })
  const base: AnyCircuitElement[] = [
    ...rendered
      .filter((e) => e.type !== "pcb_trace")
      .map((e) => (e === ground ? { ...ground, is_ground: true } : e)),
    route,
    via(
      "generic_signal_main",
      0,
      0,
      stack,
      ddrNet.source_net_id,
      "generic_ddr_route",
    ),
    via(
      "generic_signal_entry",
      b.x - 0.5,
      b.y,
      stack,
      ddrNet.source_net_id,
      "generic_ddr_route",
    ),
    via("generic_anchor_u1", ag.x, ag.y, stack, ground.source_net_id),
    via("generic_anchor_u2", bg.x, bg.y, stack, ground.source_net_id),
    fill(
      "generic_inner1",
      "inner1",
      ground.source_net_id,
      rectPoints(-10, -5, 10, 5),
      [
        rectPoints(-0.2, -0.2, 0.2, 0.2),
        rectPoints(b.x - 0.7, b.y - 0.2, b.x - 0.3, b.y + 0.2),
      ],
    ),
    fill(
      "generic_inner4",
      "inner4",
      ground.source_net_id,
      rectPoints(-10, -5, 10, 5),
      [
        rectPoints(-0.2, -0.2, 0.2, 0.2),
        rectPoints(b.x - 0.7, b.y - 0.2, b.x - 0.3, b.y + 0.2),
      ],
    ),
  ]
  const options: DdrPlacementOptions = {
    groups: [
      {
        name: "DQ",
        sourceTraceIds: [source.source_trace_id],
        provenance: "Explicit rendered TSX pin-to-pin DQ0 trace ID",
      },
    ],
    stackup: {
      provenance: {
        kind: "assumed",
        source:
          "Caller-selected generic six-layer expected stack; geometry conditional",
      },
      copperLayers: stack,
      references: [
        {
          signalLayer: "top",
          referenceLayer: "inner1",
          sourceNetId: ground.source_net_id,
          dielectricHeightMm: 0.1,
        },
        {
          signalLayer: "bottom",
          referenceLayer: "inner4",
          sourceNetId: ground.source_net_id,
          dielectricHeightMm: 0.1,
        },
      ],
    },
    filledCopper: {
      pcbCopperPourIds: ["generic_inner1", "generic_inner4"],
      provenance:
        "Generic canonical final fill import with explicit polygon voids",
    },
    signalViaAntipads: ["generic_inner1", "generic_inner4"].flatMap(
      (pcbCopperPourId) => [
        {
          pcbViaId: "generic_signal_main",
          pcbCopperPourId,
          innerRingIndex: 0,
          maxRadiusMm: 0.3,
          provenance: "Generic solved local antipad",
        },
        {
          pcbViaId: "generic_signal_entry",
          pcbCopperPourId,
          innerRingIndex: 1,
          maxRadiusMm: 0.3,
          provenance: "Generic solved final BGA-entry antipad",
        },
      ],
    ),
    policy: {
      name: "generic_reviewed",
      provenance: "Illustrative review policy; not manufacturer qualification",
      preferGround: true,
      maxReturnViaDistanceMm: 1.2,
      coverageMarginHeightFactor: 3,
    },
  }
  const before = base.map((e) =>
    e.type === "pcb_copper_pour" && e.pcb_copper_pour_id === "generic_inner1"
      ? fill(
          "generic_inner1",
          "inner1",
          ground.source_net_id,
          rectPoints(-10, -5, 10, 5),
          [
            rectPoints(-0.2, -0.2, 0.2, 0.2),
            rectPoints(b.x - 0.7, b.y - 0.2, b.x - 0.3, b.y + 0.2),
            rectPoints(-4.05, -4, -3.95, 4),
          ],
        )
      : e,
  )
  const after = [
    ...base,
    via("generic_existing_return", 0, 0.7, stack, ground.source_net_id),
  ]
  return { before, after, options }
}
const markdownSnapshot = (name: string, text: string) => {
  const path = `${import.meta.dir}/__snapshots__/${name}.md`
  if (process.env.BUN_UPDATE_SNAPSHOTS === "1") writeFileSync(path, text)
  expect(text).toBe(readFileSync(path, "utf8"))
}

test("rendered TSX and canonical PCB import produce realistic before/after Markdown and PCB snapshots, including final BGA entry", async () => {
  const { before, after, options } = await renderedFixture()
  const broken = analyzeDdrPlacement(before, options)
  const repaired = analyzeDdrPlacement(after, options)
  expect(
    broken.getIssues().some((f) => f.code === "reference_coverage_gap"),
  ).toBe(true)
  expect(
    broken.getIssues().some((f) => f.code === "return_connection_missing"),
  ).toBe(true)
  expect(repaired.getIssues()).toEqual([])
  expect(repaired.getReport().checks.referenceTransitions).toBe(2)
  expect(
    repaired
      .getReport()
      .findings.some(
        (f) =>
          f.code === "existing_return_connection" &&
          f.location.pcbViaIds?.includes("generic_anchor_u2"),
      ),
  ).toBe(true)
  markdownSnapshot("ddr-before", broken.getString())
  markdownSnapshot("ddr-after", repaired.getString())
  for (const [name, json, result] of [
    ["before", before, broken],
    ["after", after, repaired],
  ] as const) {
    const header = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="82"><rect width="800" height="82" fill="#101827"/><text x="20" y="30" fill="white" font-family="sans-serif" font-size="18">DDR ${name}: ASSUMED six-layer stack / ${result.getReport().status}</text><text x="20" y="60" fill="#cbd5e1" font-family="sans-serif" font-size="16">${name === "before" ? "Reference slit at x=-4 mm; no return bridge at x=0" : "Slit repaired; existing return and U2 anchor vias reused"}</text></svg>`
    await expect(
      stackSvgsVertically([
        header,
        convertCircuitJsonToPcbSvg(json, { layer: "top" }),
        convertCircuitJsonToPcbSvg(json, { layer: "inner1" }),
      ]),
    ).toMatchSvgSnapshot(import.meta.path, name)
  }
})
