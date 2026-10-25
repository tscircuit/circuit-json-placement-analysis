import type { AnyCircuitElement } from "circuit-json"
import type { GraphicsObject } from "graphics-debug"
import { elementsOfType, routeGeometry } from "./model"
import type {
  DdrPlacementReport,
  DdrPoint,
  DdrSeverity,
  DdrSolverState,
} from "./types"

const severityOrder: DdrSeverity[] = [
  "info",
  "unknown",
  "warning",
  "policy_violation",
  "error",
]

/** Separated layer panels; findings retain their original board-world coordinates. */
export const visualizeDdrState = (
  circuitJson: readonly AnyCircuitElement[],
  report: DdrPlacementReport,
  state: DdrSolverState,
): GraphicsObject => {
  const graphics: GraphicsObject = {
    title: `${state.stage}: ${state.status}`,
    coordinateSystem: "cartesian",
    lines: [],
    circles: [],
    texts: [],
    polygons: [],
  }
  if (!state.completedStages.includes("input") || state.status === "blocked") {
    graphics.texts!.push({
      x: 0,
      y: 0,
      text: state.reason ?? "Ready to inspect Circuit JSON",
    })
    return graphics
  }
  const board = elementsOfType(circuitJson, "pcb_board")[0]
  const width = board?.width ?? 12
  const height = board?.height ?? 6
  const signalLayers: string[] = elementsOfType(
    circuitJson,
    "pcb_trace",
  ).flatMap((t) =>
    t.route.flatMap((p) => (p.route_type === "wire" ? [p.layer] : [])),
  )
  const visible = new Set([
    ...signalLayers,
    ...(report.stackup?.references
      .filter((r) => signalLayers.includes(r.signalLayer))
      .map((r) => r.referenceLayer) ?? []),
    ...state.findings.flatMap((f) => f.location.layers ?? []),
  ])
  const layers = (report.stackup?.copperLayers ?? [...visible]).filter((l) =>
    visible.has(l),
  )
  const columns = Math.min(2, Math.max(1, layers.length))
  const at = (p: DdrPoint, layer: string) => ({
    x: p.x + (layers.indexOf(layer) % columns) * (width + 4),
    y: p.y - Math.floor(layers.indexOf(layer) / columns) * (height + 4),
  })
  for (const layer of layers) {
    graphics.texts!.push({
      ...at({ x: 0, y: height / 2 + 1 }, layer),
      text: layer,
      fontSize: 0.6,
    })
    const copper = state.copper.filter((p) => p.layer === layer)
    for (const plane of copper)
      for (const poly of plane.polygons)
        for (const [i, ring] of poly.entries())
          graphics.polygons!.push({
            points: ring.map((p) => at(p, layer)),
            fill: i ? "white" : "#b5ded0",
            stroke: "#6da58e",
            strokeWidth: 0.05,
            layer,
          })
    for (const trace of elementsOfType(circuitJson, "pcb_trace"))
      for (const segment of routeGeometry(trace).segments.filter(
        (s) => s.layer === layer,
      ))
        graphics.lines!.push({
          points: [at(segment.start, layer), at(segment.end, layer)],
          strokeColor: report.groups.some((g) =>
            g.sourceTraceIds?.includes(trace.source_trace_id ?? ""),
          )
            ? "#7942b8"
            : "#81939b",
          strokeWidth: segment.width,
          layer,
        })
    for (const contact of state.viaContacts.filter((v) =>
      v.span.includes(layer),
    )) {
      const via = elementsOfType(circuitJson, "pcb_via").find(
        (v) => v.pcb_via_id === contact.pcbViaId,
      )!
      const ground = elementsOfType(circuitJson, "source_net").some(
        (n) =>
          n.source_net_id === contact.sourceNetId && n.is_ground && !n.is_power,
      )
      graphics.circles!.push({
        center: at(via, layer),
        radius: via.outer_diameter / 2,
        fill: ground
          ? contact.contactLayers.includes(layer)
            ? "#16715c"
            : "#b67b25"
          : "#7942b8",
        stroke: ground
          ? contact.contactLayers.includes(layer)
            ? "#16715c"
            : "#b67b25"
          : "#7942b8",
        layer,
      })
      graphics.circles!.push({
        center: at(via, layer),
        radius: via.hole_diameter / 2,
        fill: "white",
        stroke: "none",
        layer,
      })
    }
    // Draw advisory/unknown findings after coverage so a fault stays visible.
    for (const finding of state.findings
      .filter((f) => f.location.layers?.includes(layer) && f.location.start)
      .sort(
        (a, b) =>
          severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
      )) {
      const location = finding.location
      const color =
        finding.severity === "info"
          ? "#16715c"
          : finding.severity === "unknown"
            ? "#a36200"
            : "#cc324b"
      if (!location.end) {
        const accepted =
          finding.code === "existing_return_connection"
            ? state.viaContacts.filter(
                (v) =>
                  location.pcbViaIds?.includes(v.pcbViaId) &&
                  v.sourceNetId !== location.sourceNetId &&
                  v.contactLayers.includes(layer),
              )
            : []
        const points =
          finding.code === "existing_return_connection"
            ? accepted.map(
                (contact) =>
                  elementsOfType(circuitJson, "pcb_via").find(
                    (v) => v.pcb_via_id === contact.pcbViaId,
                  )!,
              )
            : [location.start!]
        for (const point of points)
          graphics.polygons!.push({
            points: Array.from({ length: 24 }, (_, i) =>
              at(
                {
                  x: point.x + 0.5 * Math.cos((i * Math.PI) / 12),
                  y: point.y + 0.5 * Math.sin((i * Math.PI) / 12),
                },
                layer,
              ),
            ),
            stroke: color,
            strokeWidth: 0.12,
            fill: "none",
            layer,
            label: finding.summary,
          })
        continue
      }
      graphics.lines!.push({
        points: [
          at(location.start!, layer),
          at(location.end ?? location.start!, layer),
        ],
        strokeColor: color,
        strokeWidth: state.newFindingIds.includes(finding.id) ? 0.3 : 0.15,
        layer,
        label: finding.summary,
      })
    }
  }
  const finding =
    state.findings.find((f) => f.severity !== "info") ??
    state.findings.find((f) => f.code === "existing_return_connection") ??
    state.findings.find((f) => f.code === "reference_centerline_covered")
  const caption =
    finding?.summary ??
    `${state.stage}: ${state.status === "complete" ? "screening ended" : "checks in progress"}.`
  const centerX = ((columns - 1) * (width + 4)) / 2
  const bottom =
    -Math.floor((layers.length - 1) / columns) * (height + 4) - height / 2 - 1.5
  const lines =
    caption.match(
      new RegExp(`.{1,${columns * 30}}(?:\\s|$)|.{1,${columns * 30}}`, "g"),
    ) ?? []
  for (const [i, text] of lines.entries())
    graphics.texts!.push({
      x: centerX,
      y: bottom - i * 0.9,
      text,
      fontSize: 0.65,
    })
  graphics.texts!.push({
    x: centerX,
    y: bottom - lines.length * 0.9 - 0.5,
    text: report.stackup
      ? "ASSUMED references; DDR identity unknown."
      : "References pending; DDR identity unknown.",
    fontSize: 0.45,
  })
  return graphics
}
