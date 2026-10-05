import { type AnyCircuitElement, any_circuit_element } from "circuit-json"
import { analyzeDdrPlacement, type DdrFinding, type DdrPoint } from "../../lib"
import {
  annulusContact,
  pointInCopper,
  polygon,
  pourGeometry,
} from "../../lib/ddr/geometry"

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
export const layers = ["top", "inner1", "inner2", "inner3", "inner4", "bottom"]
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
  return { json }
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
// Exploded geometry; the transition views crop around the real signal via, with exaggerated layer spacing.
export const visualSnapshot = (cases: (Fixture & { title: string })[]) => {
  let scopeLine = ""
  const panels = cases.map(({ title, json }, panelIndex) => {
    const analysis = analyzeDdrPlacement(json)
    const report = analysis.getReport()
    const board = json.find((e) => e.type === "pcb_board")!
    if (
      board.type !== "pcb_board" ||
      board.width === undefined ||
      board.height === undefined
    )
      throw new Error("Fixture board dimensions missing")
    const transition = json
      .flatMap((e) => (e.type === "pcb_trace" ? e.route : []))
      .find((p) => p.route_type === "via")
    const zoom = transition?.route_type === "via"
    const center = zoom
      ? { x: transition.x, y: transition.y - 0.5 }
      : board.center
    const frame = zoom
      ? rect(center.x - 1.8, center.y - 1.3, center.x + 1.8, center.y + 1.3)
      : rect(
          board.center.x - board.width / 2,
          board.center.y - board.height / 2,
          board.center.x + board.width / 2,
          board.center.y + board.height / 2,
        )
    const shownLayers = ["top", "inner1", ...(zoom ? ["inner4", "bottom"] : [])]
    const sx = zoom ? 90 : 42
    const sy = zoom ? 95 : 22
    const step = zoom ? 125 : 165
    const project = (p: DdrPoint, layer: string): [number, number] => [
      355 + (p.x - center.x) * sx + (p.y - center.y) * sy,
      195 -
        (p.x - center.x) * sx * 0.15 +
        (p.y - center.y) * sy * 0.45 +
        Math.max(0, shownLayers.indexOf(layer)) * step,
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
      fill = "#263747",
      size = 17,
    ) =>
      `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}">${xml(s)}</text>`
    const line = (
      a: DdrPoint,
      b: DdrPoint,
      layer: string,
      stroke: string,
      width = 6,
    ) =>
      `<path d="M${project(a, layer)} L${project(b, layer)}" stroke="${stroke}" stroke-width="${width}" fill="none" stroke-linecap="round"/>`
    const geometry: string[] = []
    for (const layer of shownLayers.slice().reverse()) {
      const clipId = `crop_${panelIndex}_${layer}`
      geometry.push(
        `<clipPath id="${clipId}"><path d="${path(frame, layer)}"/></clipPath>`,
      )
      geometry.push(
        `<path d="${path(frame, layer)}" fill="none" stroke="#c3cfda" stroke-width="1.5" stroke-dasharray="5 6"/>`,
      )
      for (const e of json)
        if (
          e.type === "pcb_copper_pour" &&
          e.layer === layer &&
          e.shape === "brep"
        ) {
          const rings = [e.brep_shape.outer_ring, ...e.brep_shape.inner_rings]
          const curved = rings.some((r) =>
            r.vertices.some((p) => (p.bulge ?? 0) !== 0),
          )
          const shape = pourGeometry(e)
          const floating =
            shape &&
            report.findings.some(
              (f) =>
                f.code === "reference_island_unanchored" &&
                f.location.layers?.includes(layer) &&
                f.location.start &&
                f.location.end &&
                pointInCopper(
                  {
                    x: (f.location.start.x + f.location.end.x) / 2,
                    y: (f.location.start.y + f.location.end.y) / 2,
                  },
                  shape,
                ),
            )
          geometry.push(
            `<path d="${rings.map((r) => path(r.vertices, layer)).join(" ")}" clip-path="url(#${clipId})" fill="${curved ? "#f6eddb" : floating ? "#f5c4c8" : !report.stackup ? "#e1e7ec" : "#a8d7c2"}" fill-rule="evenodd" stroke="${curved ? "#bb812b" : "#3d856a"}" stroke-width="2" ${curved ? 'stroke-dasharray="8 5"' : ""}/>`,
          )
          if (curved)
            geometry.push(
              text("curved edge — chord shown", 180, 345, "#98641b", 19),
            )
        }
      const [x, y] = project(frame[2]!, layer)
      const copper = json.some(
        (e) => e.type === "pcb_copper_pour" && e.layer === layer,
      )
      geometry.push(
        text(
          copper ? `${layer} · GND` : layer,
          x - (zoom ? 30 : 115),
          y + 28,
          copper ? "#276b52" : "#6549bb",
          20,
        ),
      )
    }
    for (const e of json) {
      if (e.type === "pcb_smtpad" && e.shape === "circle") {
        const [x, y] = project(e, e.layer)
        const port = json.find(
          (p) => p.type === "pcb_port" && p.pcb_port_id === e.pcb_port_id,
        )
        const ground = json.some(
          (t) =>
            t.type === "source_trace" &&
            port?.type === "pcb_port" &&
            t.connected_source_port_ids.includes(port.source_port_id) &&
            t.connected_source_net_ids.includes("gnd"),
        )
        geometry.push(
          `<g clip-path="url(#crop_${panelIndex}_${e.layer})"><circle transform="matrix(${sx} ${-sx * 0.15} ${sy} ${sy * 0.45} ${x} ${y})" r="${e.radius}" fill="${ground ? "#dba24b" : "#bba8e1"}"/></g>`,
        )
      }
      if (e.type === "pcb_trace")
        for (let i = 0; i < e.route.length - 1; i++) {
          const a = e.route[i]!
          const b = e.route[i + 1]!
          if (a.route_type === "through_pad" || b.route_type === "through_pad")
            continue
          const invalid = [a, b].find(
            (p) =>
              !finite(p) ||
              (p.route_type === "wire" &&
                (!Number.isFinite(p.width) || p.width <= 0)),
          )
          if (invalid) {
            if (i === 0)
              geometry.push(
                text(
                  !finite(invalid)
                    ? `Cannot draw route: x = ${invalid.x}`
                    : `Cannot draw route: width = ${invalid.route_type === "wire" ? invalid.width : "unknown"}`,
                  150,
                  235,
                  "#98641b",
                  22,
                ),
              )
            continue
          }
          const layer = a.route_type === "wire" ? a.layer : a.to_layer
          if (layer === (b.route_type === "wire" ? b.layer : b.from_layer))
            geometry.push(
              `<g clip-path="url(#crop_${panelIndex}_${layer})">${line(a, b, layer, "#7042bc", 8)}</g>`,
            )
        }
      if (e.type === "pcb_via" && finite(e)) {
        if (
          zoom &&
          (Math.abs(e.x - center.x) > 1.8 || Math.abs(e.y - center.y) > 1.3)
        )
          continue
        const span = shownLayers.filter((l) =>
          (e.layers as string[]).includes(l),
        )
        if (!span.length) continue
        const a = project(e, span[0]!)
        const b = project(e, span[span.length - 1]!)
        const ground = e.source_net_id === "gnd"
        const stroke = ground ? "#c78932" : "#7042bc"
        geometry.push(
          `<path d="M${a} L${b}" stroke="${stroke}" stroke-width="${Math.max(7, e.outer_diameter * sx * 0.65)}" stroke-opacity=".8"/>`,
        )
        for (const layer of span) {
          const [x, y] = project(e, layer)
          geometry.push(
            `<g transform="matrix(${sx} ${-sx * 0.15} ${sy} ${sy * 0.45} ${x} ${y})"><circle r="${e.outer_diameter / 2}" fill="${stroke}"/><circle r="${e.hole_diameter / 2}" fill="white"/></g>`,
          )
        }
        if (zoom)
          geometry.push(
            text(
              ground ? "GND via" : "signal via",
              a[0] + (ground ? -90 : 18),
              a[1] - 38,
              stroke,
              20,
            ),
          )
      }
    }
    // Highlights come only from findings; accepted via contacts exclude signal-net IDs.
    for (const f of report.findings.slice().reverse()) {
      const loc = f.location
      if (f.severity === "info" && f.code !== "existing_return_connection")
        continue
      if (f.code === "return_connection_missing" && loc.start) {
        const references = report.stackup!.references.filter((r) =>
          loc.layers?.includes(r.referenceLayer),
        )
        const candidate = json.find(
          (e) =>
            e.type === "pcb_via" &&
            loc.pcbViaIds?.includes(e.pcb_via_id) &&
            references.some((r) => r.sourceNetId === e.source_net_id),
        )
        if (candidate?.type === "pcb_via") {
          const span = shownLayers.filter((l) =>
            (candidate.layers as string[]).includes(l),
          )
          const short = references.some(
            (r) => !(candidate.layers as string[]).includes(r.referenceLayer),
          )
          const clearance = json.find((e) => {
            if (
              e.type !== "pcb_copper_pour" ||
              e.shape !== "brep" ||
              !references.some((r) => r.referenceLayer === e.layer)
            )
              return false
            const shape = pourGeometry(e)
            return (
              shape &&
              annulusContact(
                candidate,
                candidate.outer_diameter / 2,
                candidate.hole_diameter / 2,
                shape,
              ) === false
            )
          })
          let target = project(candidate, span[span.length - 1]!)
          let label = `Ends at ${span[span.length - 1]}`
          if (
            !short &&
            clearance?.type === "pcb_copper_pour" &&
            clearance.shape === "brep"
          ) {
            const hole = clearance.brep_shape.inner_rings.find((r) =>
              pointInCopper(candidate, polygon(r.vertices)),
            )
            if (hole) {
              geometry.push(
                `<path d="${path(hole.vertices, clearance.layer)}" fill="none" stroke="${color(f)}" stroke-width="3"/>`,
              )
              target = project(hole.vertices[1]!, clearance.layer)
              label = `Copper clearance on ${clearance.layer}`
            }
          }
          geometry.push(
            `<path d="M${target} L${target[0] + 70},${target[1] + 60} H650" fill="none" stroke="${color(f)}" stroke-width="3"/>`,
            text(label, target[0] + 75, target[1] + 87, color(f), 19),
          )
        } else if (references.length === 2) {
          const a = project(loc.start, references[0]!.referenceLayer)
          const b = project(loc.start, references[1]!.referenceLayer)
          const x = a[0] + 160
          geometry.push(
            `<path d="M${x - 12},${a[1]} H${x} V${b[1]} H${x - 12}" fill="none" stroke="${color(f)}" stroke-width="3"/>`,
            text(
              `${report.netNames?.[references[0]!.sourceNetId] ?? "Reference"}: ${references.map((r) => r.referenceLayer).join(" ↔ ")}`,
              410,
              b[1] + 42,
              color(f),
              19,
            ),
          )
        }
      }
      const affectedLayers = (loc.layers ?? [])
        .filter((l) =>
          report.stackup?.references.some((r) => r.referenceLayer === l),
        )
        .slice(0, 1)
      if (
        loc.start &&
        finite(loc.start) &&
        ![
          "existing_return_connection",
          "reference_island_unanchored",
          "return_connection_missing",
        ].includes(f.code)
      )
        for (const layer of affectedLayers) {
          if (!shownLayers.includes(layer)) continue
          const [x, y] = project(loc.start, layer)
          if (loc.end && finite(loc.end))
            geometry.push(line(loc.start, loc.end, layer, color(f), 11))
          geometry.push(
            `<circle cx="${x}" cy="${y}" r="16" stroke="${color(f)}" stroke-width="4" fill="none"/>`,
          )
        }
      for (const id of f.code === "existing_return_connection"
        ? (loc.pcbViaIds ?? [])
        : []) {
        const via = json.find(
          (e) => e.type === "pcb_via" && e.pcb_via_id === id,
        )
        if (via?.type !== "pcb_via" || via.source_net_id !== "gnd") continue
        for (const layer of loc.layers ?? [])
          if (
            shownLayers.includes(layer) &&
            report.stackup?.references.some((r) => r.referenceLayer === layer)
          ) {
            const [x, y] = project(via, layer)
            geometry.push(
              `<ellipse cx="${x}" cy="${y}" rx="${via.outer_diameter * sx * 0.8}" ry="${via.outer_diameter * sy * 0.4}" stroke="${color(f)}" stroke-width="4" fill="none"/>`,
            )
          }
      }
    }
    const state =
      report.status === "issues_found"
        ? "ISSUE"
        : report.findings.some((f) => f.severity === "unknown") ||
            !report.checks.referenceSegments
          ? "UNKNOWN"
          : "CONDITIONAL"
    const tone =
      state === "ISSUE"
        ? "#c92f45"
        : state === "UNKNOWN"
          ? "#a36200"
          : "#16715c"
    const label = report.stackup
      ? `${state} · ${report.stackup.provenance.kind.toUpperCase()} stackup`
      : "UNKNOWN stackup"
    const rawMarkdown = analysis.getString()
    const markdownLines = rawMarkdown.split("\n").filter(Boolean)
    scopeLine = markdownLines.pop()!
    const reportLines = markdownLines.flatMap(
      (s) =>
        s
          .replace(/^#+\s*/, "")
          .replaceAll("**", "")
          .replace(/\\([_[\]*`])/g, "$1")
          .match(/.{1,82}(?:\s|$)|.{1,82}/g) ?? [""],
    )
    const reportY = zoom ? 700 : 500
    return {
      height: reportY + 30 + reportLines.length * 22,
      svg: `<desc>${xml(rawMarkdown)}\n${xml(JSON.stringify(report.findings.map((f) => ({ id: f.id, code: f.code, location: f.location }))))}</desc>${text(title, 26, 44, "#172d3b", 25)}${text(label, 26, 76, tone, 18)}${geometry.join("\n")}${reportLines.map((s, i) => text(s, 26, reportY + i * 22, "#263747", 17)).join("\n")}`,
    }
  })
  let y = 65
  const rows = []
  for (let i = 0; i < panels.length; i += 2) {
    for (let j = i; j < Math.min(i + 2, panels.length); j++)
      rows.push(
        `<g transform="translate(${(j % 2) * 740},${y})">${panels[j]!.svg}</g>`,
      )
    y += Math.max(...panels.slice(i, i + 2).map((p) => p.height)) + 24
  }
  rows.push(
    `<text x="26" y="${y}" fill="#617481" font-size="16">${xml(scopeLine)}</text><text x="26" y="${y + 24}" fill="#617481" font-size="16">Geometry illustration · layers separated for clarity · broad GND copper is the return reference · no electromagnetic simulation</text>`,
  )
  y += 50
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1480" height="${y}" font-family="Arial, sans-serif"><rect width="1480" height="${y}" fill="#fff"/><text x="26" y="29" font-size="18" fill="#617481">Purple: signal copper · gold: ground vias · red: needs attention · green rings: qualified ground contact</text>${rows.join("\n")}</svg>`
}
