import { type AnyCircuitElement, any_circuit_element } from "circuit-json"
import {
  analyzeDdrPlacement,
  type DdrFinding,
  type DdrPlacementOptions,
  type DdrPoint,
} from "../../lib"

const element = (raw: object): AnyCircuitElement =>
  ({ ...raw, ...any_circuit_element.parse(raw) }) as AnyCircuitElement
export const rect = (x1: number, y1: number, x2: number, y2: number) => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
]
export const plane = (
  id: string,
  layer: string,
  holes: DdrPoint[][] = [],
  outline = rect(-6, -3, 6, 3),
) =>
  element({
    type: "pcb_copper_pour",
    pcb_copper_pour_id: id,
    shape: "brep",
    layer,
    source_net_id: "gnd",
    brep_shape: {
      outer_ring: { vertices: outline.slice().reverse() },
      inner_rings: holes.map((vertices) => ({ vertices })),
    },
  })
export const groundVia = (id: string, x: number, y: number, layers: string[]) =>
  element({
    type: "pcb_via",
    pcb_via_id: id,
    x,
    y,
    layers,
    source_net_id: "gnd",
    outer_diameter: 0.6,
    hole_diameter: 0.25,
  })
const layers = ["top", "inner1", "inner2", "inner3", "inner4", "bottom"]
const terminal = (
  id: string,
  x: number,
  y: number,
  layer: string,
  net: string,
) => [
  element({
    type: "source_port",
    source_port_id: id,
    source_component_id: id,
    name: id,
  }),
  element({
    type: "pcb_port",
    pcb_port_id: id,
    source_port_id: id,
    x,
    y,
    layers: [layer],
  }),
  element({
    type: "pcb_smtpad",
    pcb_smtpad_id: `pad_${id}`,
    pcb_port_id: id,
    shape: "circle",
    radius: 0.35,
    x,
    y,
    layer,
  }),
  element({
    type: "source_trace",
    source_trace_id: `source_${id}`,
    connected_source_port_ids: [id],
    connected_source_net_ids: [net],
  }),
]
export const ddrVisualFixture = (layerHop = false) => {
  const wire = (x: number, layer: string) => ({
    route_type: "wire",
    x,
    y: 0,
    width: 0.15,
    layer,
  })
  const json = [
    element({
      type: "pcb_board",
      pcb_board_id: "board",
      center: { x: 0, y: 0 },
      width: 12,
      height: 6,
      num_layers: 6,
    }),
    element({
      type: "source_net",
      source_net_id: "dq",
      name: "DQ0",
      member_source_group_ids: [],
    }),
    element({
      type: "source_net",
      source_net_id: "gnd",
      name: "GND",
      member_source_group_ids: [],
      is_ground: true,
    }),
    ...terminal("a", -5, 0, "top", "dq"),
    ...terminal("b", 5, 0, layerHop ? "bottom" : "top", "dq"),
    ...terminal("ground_a", -5, -1, "top", "gnd"),
    ...terminal("ground_b", 5, -1, layerHop ? "bottom" : "top", "gnd"),
    element({
      type: "source_trace",
      source_trace_id: "dq_source",
      connected_source_port_ids: ["a", "b"],
      connected_source_net_ids: ["dq"],
    }),
    element({
      type: "pcb_trace",
      pcb_trace_id: "dq_route",
      source_trace_id: "dq_source",
      route: [
        { ...wire(-5, "top"), start_pcb_port_id: "a" },
        ...(layerHop
          ? [
              wire(0, "top"),
              {
                route_type: "via",
                x: 0,
                y: 0,
                from_layer: "top",
                to_layer: "bottom",
              },
              wire(0, "bottom"),
            ]
          : []),
        { ...wire(5, layerHop ? "bottom" : "top"), end_pcb_port_id: "b" },
      ],
    }),
    plane("gnd1", "inner1", layerHop ? [rect(-0.3, -0.3, 0.3, 0.3)] : []),
    groundVia("anchor_a", -5, -1, ["top", "inner1"]),
    groundVia(
      "anchor_b",
      5,
      -1,
      layerHop ? ["inner4", "bottom"] : ["top", "inner1"],
    ),
    ...(layerHop
      ? [
          plane("gnd4", "inner4", [rect(-0.3, -0.3, 0.3, 0.3)]),
          element({
            type: "pcb_via",
            pcb_via_id: "signal_via",
            x: 0,
            y: 0,
            layers,
            source_net_id: "dq",
            pcb_trace_id: "dq_route",
            outer_diameter: 0.4,
            hole_diameter: 0.2,
          }),
        ]
      : []),
  ]
  const options: DdrPlacementOptions = {
    groups: [
      {
        name: "DQ",
        sourceTraceIds: ["dq_source"],
        provenance: "Original generic DQ0 fixture",
      },
    ],
    stackup: {
      provenance: { kind: "declared", source: "Generic six-layer design" },
      copperLayers: layers,
      references: [
        { signalLayer: "top", referenceLayer: "inner1", sourceNetId: "gnd" },
        ...(layerHop
          ? [
              {
                signalLayer: "bottom",
                referenceLayer: "inner4",
                sourceNetId: "gnd",
              },
            ]
          : []),
      ],
    },
    filledCopper: {
      pcbCopperPourIds: layerHop ? ["gnd1", "gnd4"] : ["gnd1"],
      provenance: "Final generic fill with explicit voids",
    },
    signalViaAntipads: layerHop
      ? ["gnd1", "gnd4"].map((pcbCopperPourId) => ({
          pcbViaId: "signal_via",
          pcbCopperPourId,
          innerRingIndex: 0,
          maxRadiusMm: 0.45,
          provenance: "Isolated solved signal clearance",
        }))
      : [],
    policy: {
      name: "fixture_policy",
      provenance: "Illustrative chosen policy, not SI signoff",
      maxReturnViaDistanceMm: 1,
    },
  }
  return { json, options }
}

type Fixture = ReturnType<typeof ddrVisualFixture>
const xml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
const color = (finding: DdrFinding) =>
  finding.severity === "info"
    ? "#16715c"
    : finding.severity === "unknown"
      ? "#a36200"
      : "#c92f45"
const finite = (p: DdrPoint) => Number.isFinite(p.x) && Number.isFinite(p.y)
// Exploded board-world geometry only; vertical spacing is exaggerated, not an EM/current-density model.
export const visualSnapshot = (cases: (Fixture & { title: string })[]) => {
  const panels = cases.map(({ title, json, options }) => {
    const analysis = analyzeDdrPlacement(json, options)
    const report = analysis.getReport()
    const apiHeader = analysis
      .getString()
      .split("\n")
      .filter((s) => /^(Status:|Stackup:|Evaluated:)/.test(s))
    const board = json.find((e) => e.type === "pcb_board")!
    if (
      board.type !== "pcb_board" ||
      board.width === undefined ||
      board.height === undefined
    )
      throw new Error("Fixture board dimensions missing")
    const bounds = rect(
      board.center.x - board.width / 2,
      board.center.y - board.height / 2,
      board.center.x + board.width / 2,
      board.center.y + board.height / 2,
    )
    const shownLayers = [
      "top",
      "inner1",
      ...(json.some((e) => e.type === "pcb_copper_pour" && e.layer === "inner4")
        ? ["inner4", "bottom"]
        : []),
    ]
    const project = (p: DdrPoint, layer: string): [number, number] => [
      250 + p.x * 27 + p.y * 13,
      150 - p.x * 4 + p.y * 9 + Math.max(0, shownLayers.indexOf(layer)) * 52,
    ]
    const path = (points: DdrPoint[], layer: string) =>
      `${points
        .filter(finite)
        .map((p, i) => `${i ? "L" : "M"}${project(p, layer).join(",")}`)
        .join(" ")} Z`
    const text = (
      s: string,
      x: number,
      y: number,
      fill = "#293645",
      size = 13,
    ) =>
      `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}">${xml(s)}</text>`
    const line = (
      a: DdrPoint,
      b: DdrPoint,
      layer: string,
      stroke: string,
      width = 3,
    ) =>
      `<path d="M${project(a, layer).join(",")} L${project(b, layer).join(",")}" stroke="${stroke}" stroke-width="${width}" fill="none" stroke-linecap="round"/>`
    const geometry: string[] = []
    for (const layer of shownLayers.slice().reverse()) {
      geometry.push(
        `<path d="${path(bounds, layer)}" fill="#e9eef4" fill-opacity=".35" stroke="#b9c5d2" stroke-dasharray="4 4"/>`,
      )
      for (const e of json)
        if (
          e.type === "pcb_copper_pour" &&
          e.layer === layer &&
          e.shape === "brep"
        ) {
          const rings = [e.brep_shape.outer_ring, ...e.brep_shape.inner_rings]
          geometry.push(
            `<path d="${rings.map((r) => path(r.vertices, layer)).join(" ")}" fill="#9bd5c5" fill-opacity=".8" fill-rule="evenodd" stroke="#488b79"/>`,
          )
        }
      const [x, y] = project(bounds[2]!, layer)
      geometry.push(text(layer, x + 9, y + 5, "#5d6d7d", 12))
    }
    for (const e of json) {
      if (e.type === "pcb_smtpad" && e.shape === "circle") {
        const port = json.find(
          (p) => p.type === "pcb_port" && p.pcb_port_id === e.pcb_port_id,
        )
        const net =
          port?.type === "pcb_port"
            ? json.find(
                (t) =>
                  t.type === "source_trace" &&
                  t.connected_source_port_ids.includes(port.source_port_id),
              )
            : undefined
        const ground =
          net?.type === "source_trace" &&
          net.connected_source_net_ids.includes("gnd")
        const [x, y] = project(e, e.layer)
        geometry.push(
          `<circle transform="matrix(27 -4 13 9 ${x} ${y})" r="${e.radius}" fill="${ground ? "#edca8d" : "#d6cbec"}"/>`,
        )
        if (ground)
          geometry.push(text("GND pad", x - 20, y - 15, "#966020", 10))
      }
      if (e.type === "pcb_trace")
        for (let i = 0; i < e.route.length - 1; i++) {
          const a = e.route[i]!
          const b = e.route[i + 1]!
          if (
            a.route_type === "through_pad" ||
            b.route_type === "through_pad" ||
            !finite(a) ||
            !finite(b) ||
            (a.route_type === "wire" &&
              (!Number.isFinite(a.width) || a.width <= 0)) ||
            (b.route_type === "wire" &&
              (!Number.isFinite(b.width) || b.width <= 0))
          )
            continue
          const layer = a.route_type === "wire" ? a.layer : a.to_layer
          if (layer === (b.route_type === "wire" ? b.layer : b.from_layer))
            geometry.push(line(a, b, layer, "#6549bb", 4))
        }
      if (e.type === "pcb_via" && finite(e)) {
        const span = shownLayers.filter((l) =>
          (e.layers as string[]).includes(l),
        )
        if (!span.length) continue
        const a = project(e, span[0]!)
        const b = project(e, span[span.length - 1]!)
        const stroke = e.source_net_id === "gnd" ? "#bd7b2e" : "#6549bb"
        geometry.push(
          `<path d="M${a} L${b}" stroke="${stroke}" stroke-width="5"/>`,
        )
        for (const layer of span) {
          const [x, y] = project(e, layer)
          geometry.push(
            `<g transform="matrix(27 -4 13 9 ${x} ${y})"><circle r="${e.outer_diameter / 2}" fill="${stroke}"/><circle r="${e.hole_diameter / 2}" fill="white"/></g>`,
          )
        }
        if (e.pcb_via_id === "signal_via" || e.pcb_via_id === "return_via")
          geometry.push(
            text(
              e.pcb_via_id,
              a[0] + (e.source_net_id === "gnd" ? -90 : 10),
              a[1] + (e.source_net_id === "gnd" ? -20 : -12),
              stroke,
              11,
            ),
          )
      }
    }
    // No synthetic findings: every highlight uses a reported point/layer or actual reported via ID.
    for (const f of report.findings.slice().reverse()) {
      const loc = f.location
      if (
        loc.start &&
        finite(loc.start) &&
        f.code !== "existing_return_connection"
      )
        for (const layer of loc.layers ?? []) {
          if (
            !shownLayers.includes(layer) ||
            (f.code === "reference_centerline_covered" &&
              !options.stackup?.references.some((r) => r.signalLayer === layer))
          )
            continue
          if (loc.end && finite(loc.end))
            geometry.push(
              line(
                loc.start,
                loc.end,
                layer,
                color(f),
                f.severity === "info" ? 2 : 7,
              ),
            )
          const [x, y] = project(loc.start, layer)
          geometry.push(
            `<circle cx="${x}" cy="${y}" r="6" stroke="${color(f)}" stroke-width="2" fill="white"/>`,
          )
        }
      for (const id of loc.pcbViaIds ?? []) {
        const via = json.find(
          (e) => e.type === "pcb_via" && e.pcb_via_id === id,
        )
        if (
          via?.type !== "pcb_via" ||
          (f.code === "existing_return_connection" &&
            via.source_net_id !== "gnd")
        )
          continue
        for (const layer of loc.layers ?? [])
          if (shownLayers.includes(layer)) {
            const [x, y] = project(via, layer)
            geometry.push(
              `<ellipse cx="${x}" cy="${y}" rx="12" ry="6" stroke="${color(f)}" stroke-width="2" fill="none"/>`,
            )
          }
      }
    }
    const markdown = [
      `# ${title}`,
      ...apiHeader,
      `DDR group: ${report.groups.map((g) => `${g.name} (${g.provenance})`).join("; ")}`,
      `Final fill: DECLARED — ${options.filledCopper?.provenance}`,
      ...report.findings.flatMap((f) => [
        `- ${f.severity.toUpperCase()} ${f.code}`,
        `  ${f.id}`,
        `  ${f.summary}`,
        ...(f.severity !== "info" || f.code === "existing_return_connection"
          ? f.evidence.map((e) => `  Evidence: ${e}`)
          : []),
        ...(f.severity !== "info" ? [`  Repair: ${f.repairHint}`] : []),
      ]),
    ].join("\n")
    const lines = markdown
      .split("\n")
      .flatMap((s) => s.match(/.{1,70}(?:\s|$)|.{1,70}/g) ?? [""])
    const reportY = shownLayers.length === 4 ? 410 : 290
    return {
      height: reportY + 24 + lines.length * 18,
      scope: report.limits.filter((l) => l.startsWith("NOT EVALUATED:")),
      svg: `<desc>${xml(markdown)}</desc>${text(title, 24, 30, "#172639", 18)}${text("DQ0 signal · GND filled copper · plated vias", 24, 54, "#5d6d7d", 12)}${geometry.join("\n")}${lines.map((s, i) => text(s, 24, reportY + i * 18, "#293645", 12)).join("\n")}`,
    }
  })
  let y = 92
  const rows = []
  for (let i = 0; i < panels.length; i += 2) {
    for (let j = i; j < Math.min(i + 2, panels.length); j++)
      rows.push(
        `<g transform="translate(${(j % 2) * 570},${y})">${panels[j]!.svg}</g>`,
      )
    y += Math.max(...panels.slice(i, i + 2).map((p) => p.height)) + 24
  }
  const scope = Array.from(new Set(panels.flatMap((p) => p.scope))).join(" ")
  const footer = scope.match(/.{1,145}(?:\s|$)|.{1,145}/g) ?? []
  rows.push(
    footer
      .map(
        (s, i) =>
          `<text x="24" y="${y + i * 18}" font-size="12" fill="#5d6d7d">${xml(s)}</text>`,
      )
      .join("\n"),
  )
  y += footer.length * 18 + 18
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1140" height="${y}" font-family="Arial, sans-serif"><rect width="1140" height="${y}" fill="#fff"/><text x="24" y="27" font-size="17" fill="#172639">DDR reference geometry + actual analyzer findings</text><text x="24" y="50" font-size="13" fill="#5d6d7d">Isometric geometry illustration; exploded layers. Return reference is broad plane copper, not a second etched trace.</text><text x="24" y="72" font-size="12" fill="#5d6d7d">Green = analyzer info · red = error/policy · amber = unknown. No current-density or electromagnetic simulation.</text>${rows.join("\n")}</svg>`
}
