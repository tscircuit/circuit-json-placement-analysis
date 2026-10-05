import type { AnyCircuitElement, PcbTrace } from "circuit-json"
import { formatDdrPlacementReport } from "./format-ddr-report"
import {
  area,
  difference,
  distance,
  pointAt,
  pointInCopper,
  polygon,
  segmentCopperClearance,
  traceStrip,
  uncoveredIntervals,
} from "./geometry"
import {
  type DdrSegment,
  type Plane,
  ReferenceCopperModel,
  routeGeometry,
  SourceConnectivity,
  viaSpan,
} from "./model"
import type {
  AnalyzeDdrPlacementResult,
  DdrLocation,
  DdrPlacementOptions,
  DdrPlacementReport,
  DdrPoint,
  DdrPolicy,
  DdrReference,
  DdrSeverity,
} from "./types"

const DEFAULT_POLICY: DdrPolicy = {
  name: "strict_ground",
  provenance:
    "Analyzer conservative preference; no manufacturer profile or universal stitch distance",
  preferGround: true,
}
const LIMITS = [
  "Only caller-identified final filled copper is evaluated. The caller must include all clearance holes, antipads, cutouts and solved thermal spokes; requested pour outlines are insufficient.",
  "Straight-edge polygon/BRep and rotated rectangular pours are supported. Curved BRep bulges, through_pad route geometry, pill pads, plated holes and separate thermal spokes are UNKNOWN when present in the reference model.",
  "Contacts require positive copper overlap. Via annulus contacts use exact radial overlap against polygon boundaries; circular terminal pads use conservative 128-sided polygons (radial error <= 0.031%); marginal contacts are not hardware continuity proof. Zero-width touching copper needs review.",
  "Every supplied signal/reference assignment is examined, including dual-sided references. Missing assignments cannot be inferred; electromagnetic sharing between references is NOT EVALUATED.",
  "Narrow-clearance and height-scaled corridor warnings are local geometric policies. Whole-plane neck/detour impedance, return-loop inductance, capacitive-return bandwidth and field solving are NOT EVALUATED.",
  "DDR keepout/shielding, component placement distance, timing/length/skew, impedance, crosstalk, EMI and package/internal return paths are NOT EVALUATED. No manufacturer compliance profile is claimed.",
  "Endpoint checks establish modeled copper paths to the endpoint component's declared reference terminals, not package-internal continuity. Missing source/PCB port mapping is UNKNOWN.",
]
const ORDER: Record<DdrSeverity, number> = {
  error: 0,
  policy_violation: 1,
  warning: 2,
  unknown: 3,
  info: 4,
}
// Deterministic FNV-1a location ID; no Node runtime dependency for browser consumers.
const locationHash = (location: DdrLocation) => {
  let hash = 0xcbf29ce484222325n
  for (const character of JSON.stringify(location))
    hash = BigInt.asUintN(
      64,
      (hash ^ BigInt(character.codePointAt(0)!)) * 0x100000001b3n,
    )
  return hash.toString(16).padStart(16, "0")
}
/** Analyze rendered Circuit JSON. Geometry is board-world mm, +X right/+Y up; no TSX source parsing or routing is performed. */
export const analyzeDdrPlacement = (
  circuitJson: readonly AnyCircuitElement[],
  options: DdrPlacementOptions = {},
): AnalyzeDdrPlacementResult => {
  const policy = options.policy ?? DEFAULT_POLICY
  const report: DdrPlacementReport = {
    status: "incomplete",
    stackup: options.stackup ?? null,
    policy,
    groups: options.groups ?? [],
    checks: { referenceSegments: 0, referenceTransitions: 0, endpoints: 0 },
    findings: [],
    limits: [...LIMITS],
  }
  const provenance = [
    options.stackup
      ? `${options.stackup.provenance.kind.toUpperCase()} stackup: ${options.stackup.provenance.source}`
      : "UNKNOWN stackup",
    `Policy: ${policy.name}; ${policy.provenance}`,
    ...(options.groups ?? []).map(
      (group) => `DDR membership ${group.name}: ${group.provenance}`,
    ),
    ...(options.filledCopper
      ? [`DECLARED final fill: ${options.filledCopper.provenance}`]
      : []),
  ]
  const add = (
    code: string,
    severity: DdrSeverity,
    summary: string,
    location: DdrLocation,
    evidence: string[],
    repairHint: string,
    extraProvenance: string[] = [],
  ) => {
    const canonical = {
      ...location,
      layers: location.layers?.slice().sort(),
      pcbCopperPourIds: location.pcbCopperPourIds?.slice().sort(),
      pcbViaIds: location.pcbViaIds?.slice().sort(),
      pcbPortIds: location.pcbPortIds?.slice().sort(),
    }
    const id = `${code}_${locationHash(canonical)}`
    if (report.findings.some((f) => f.id === id)) return
    report.findings.push({
      id,
      code,
      severity,
      summary,
      location: canonical,
      evidence,
      repairHint,
      provenance: [...provenance, ...extraProvenance],
    })
  }
  const finish = (): AnalyzeDdrPlacementResult => {
    report.findings.sort(
      (a, b) =>
        ORDER[a.severity] - ORDER[b.severity] || a.id.localeCompare(b.id),
    )
    report.status = report.findings.some(
      (f) =>
        f.severity === "error" ||
        f.severity === "policy_violation" ||
        f.severity === "warning",
    )
      ? "issues_found"
      : report.findings.some((f) => f.severity === "unknown") ||
          !report.checks.referenceSegments
        ? "incomplete"
        : "no_issues_in_evaluated_checks"
    return {
      getString: () => formatDdrPlacementReport(report),
      getReport: () => report,
      getIssues: () => report.findings.filter((f) => f.severity !== "info"),
    }
  }
  if (
    !options.groups?.length ||
    options.groups.some(
      (g) =>
        !g.provenance.trim() ||
        !(g.sourceNetIds?.length || g.sourceTraceIds?.length),
    )
  )
    add(
      "ddr_membership_unknown",
      "unknown",
      "DDR membership is not established.",
      {},
      [
        "No complete explicit group selection; names and TSX text are not used to infer DDR.",
      ],
      "Select source net/trace IDs from rendered Circuit JSON and provide provenance.",
    )
  if (!options.stackup) {
    add(
      "stackup_unknown",
      "unknown",
      "Electrical stackup and reference assignments are unknown; physical reference checks are NOT EVALUATED.",
      {},
      [
        "pcb_board num_layers/thickness/material do not define electrical reference roles or dielectric spacing.",
      ],
      "Supply the declared design stackup or explicitly select an ASSUMED expected stackup.",
    )
    return finish()
  }
  const stackup = options.stackup
  const boards = circuitJson.filter(
    (e): e is Extract<AnyCircuitElement, { type: "pcb_board" }> =>
      e.type === "pcb_board" && !e.is_subcircuit,
  )
  const invalidStack =
    !["declared", "assumed"].includes(stackup.provenance.kind) ||
    !stackup.provenance.source.trim() ||
    new Set(stackup.copperLayers).size !== stackup.copperLayers.length ||
    stackup.copperLayers.length < 2 ||
    stackup.copperLayers.some((l) => !l.trim()) ||
    boards.length > 1 ||
    boards.some(
      (b) =>
        b.num_layers !== undefined &&
        b.num_layers !== stackup.copperLayers.length,
    ) ||
    stackup.references.some(
      (r) =>
        !stackup.copperLayers.includes(r.signalLayer) ||
        !stackup.copperLayers.includes(r.referenceLayer) ||
        r.signalLayer === r.referenceLayer ||
        (r.dielectricHeightMm !== undefined &&
          (!Number.isFinite(r.dielectricHeightMm) ||
            r.dielectricHeightMm <= 0)),
    )
  if (invalidStack) {
    add(
      "stackup_inconsistent",
      "unknown",
      "Stackup metadata is inconsistent or ambiguous; reference checks are NOT EVALUATED.",
      {},
      [
        "Validate unique ordered layers, positive dielectric heights, actual board layer count and reference layer IDs.",
      ],
      "Correct the supplied stackup; layer counts are never silently reindexed.",
    )
    return finish()
  }
  if (
    !policy.name.trim() ||
    !policy.provenance.trim() ||
    [
      policy.maxReturnViaDistanceMm,
      policy.coverageMarginHeightFactor,
      policy.minCopperClearanceMm,
    ].some((n) => n !== undefined && (!Number.isFinite(n) || n < 0))
  ) {
    add(
      "policy_invalid",
      "unknown",
      "Invalid policy values; reference checks are NOT EVALUATED.",
      {},
      [
        "Policy thresholds must be finite nonnegative mm/factors, with named provenance.",
      ],
      "Correct the chosen policy.",
    )
    return finish()
  }
  if (
    !options.filledCopper?.provenance.trim() ||
    !options.filledCopper.pcbCopperPourIds.length
  ) {
    add(
      "filled_copper_unknown",
      "unknown",
      "Final solved reference copper is not identified; coverage/contact checks are NOT EVALUATED.",
      {},
      [
        "A requested pour outline does not establish copper after clearance/antipad solving.",
      ],
      "Provide final filled pour IDs and their render/import provenance.",
    )
    return finish()
  }
  const sourceConnectivity = new SourceConnectivity(circuitJson)
  const sourceTraces = circuitJson.filter(
    (e): e is Extract<AnyCircuitElement, { type: "source_trace" }> =>
      e.type === "source_trace",
  )
  const selectedSources = sourceTraces.filter((trace) =>
    options.groups?.some(
      (group) =>
        group.sourceTraceIds?.includes(trace.source_trace_id) ||
        group.sourceNetIds?.includes(sourceConnectivity.traceNet(trace) ?? ""),
    ),
  )
  for (const group of options.groups ?? [])
    for (const id of group.sourceTraceIds ?? [])
      if (!sourceTraces.some((t) => t.source_trace_id === id))
        add(
          "selected_trace_missing",
          "unknown",
          "Selected DDR source trace is absent.",
          { sourceTraceId: id },
          [`Selection: ${group.name}`],
          "Restore the rendered source trace or correct group membership.",
          [group.provenance],
        )
  for (const group of options.groups ?? [])
    for (const id of group.sourceNetIds ?? [])
      if (
        !circuitJson.some(
          (e) => e.type === "source_net" && e.source_net_id === id,
        )
      )
        add(
          "selected_net_missing",
          "unknown",
          "Selected DDR net is absent.",
          { sourceNetId: id },
          [`Selection: ${group.name}`],
          "Restore the rendered source net or correct group membership.",
          [group.provenance],
        )
  const traces = circuitJson
    .filter(
      (e): e is Extract<AnyCircuitElement, { type: "pcb_trace" }> =>
        e.type === "pcb_trace" &&
        selectedSources.some((t) => t.source_trace_id === e.source_trace_id),
    )
    .sort((a, b) => a.pcb_trace_id.localeCompare(b.pcb_trace_id))
  for (const sourceTrace of selectedSources)
    if (!traces.some((t) => t.source_trace_id === sourceTrace.source_trace_id))
      add(
        "ddr_route_missing",
        "unknown",
        "DDR source trace has no rendered PCB route.",
        { sourceTraceId: sourceTrace.source_trace_id },
        ["Zero route geometry cannot establish reference coverage."],
        "Render/import the final route before evaluation.",
      )
  if (!traces.length) {
    add(
      "ddr_routes_unknown",
      "unknown",
      "No routed DDR traces were selected; no physical checks were evaluated.",
      {},
      ["An empty selection cannot produce a favorable report."],
      "Supply explicit DDR membership and rendered routes.",
    )
    return finish()
  }
  const model = new ReferenceCopperModel(
    circuitJson,
    options.filledCopper.pcbCopperPourIds,
    stackup,
    sourceConnectivity,
  )
  if (model.unsupported.length)
    add(
      "reference_model_incomplete",
      "unknown",
      "Reference connectivity/fill model contains unsupported or missing geometry.",
      {},
      model.unsupported.slice().sort(),
      "Provide supported solved geometry; absence of contacts cannot be proved from this incomplete model.",
    )
  for (const short of model.shorts)
    add(
      "reference_copper_short",
      "error",
      "Unlike reference nets physically overlap on one layer.",
      {
        layers: [short.a.layer],
        pcbCopperPourIds: [...short.a.pours, ...short.b.pours].map(
          (p) => p.pcb_copper_pour_id,
        ),
      },
      [
        `Positive-area copper intersection between ${short.a.net} and ${short.b.net}.`,
      ],
      "Separate unlike rails and refill copper; never bridge power and ground with a via.",
    )
  const referenceFor = (
    signalLayer: string,
    location: DdrLocation,
  ): DdrReference[] => {
    const refs = stackup.references.filter((r) => r.signalLayer === signalLayer)
    if (!refs.length)
      add(
        "reference_assignment_unknown",
        "unknown",
        "Signal layer has no explicit reference assignment.",
        { ...location, layers: [signalLayer] },
        [
          "Layer order alone does not determine the selected electrical reference.",
        ],
        "Declare all assigned references, including both stripline sides.",
      )
    return refs
  }
  const locatePlane = (
    ref: DdrReference,
    location: DdrLocation,
  ): Plane | undefined => {
    const plane = model.plane(ref.referenceLayer, ref.sourceNetId)
    if (!plane)
      add(
        "reference_fill_unknown",
        "unknown",
        "Assigned reference has no supported identified final fill.",
        { ...location, layers: [ref.signalLayer, ref.referenceLayer] },
        [`Reference net: ${ref.sourceNetId}.`],
        "Include supported final fill for the assigned reference.",
      )
    return plane
  }
  const antipadFor = (
    trace: PcbTrace,
    segment: DdrSegment,
    plane: Plane,
    start: number,
    end: number,
  ) => {
    const transitions = routeGeometry(trace).transitions
    for (const metadata of options.signalViaAntipads ?? []) {
      if (
        !metadata.provenance.trim() ||
        !Number.isFinite(metadata.maxRadiusMm) ||
        metadata.maxRadiusMm <= 0
      )
        continue
      const via = circuitJson.find(
        (e) => e.type === "pcb_via" && e.pcb_via_id === metadata.pcbViaId,
      )
      const pour = plane.pours.find(
        (p) => p.pcb_copper_pour_id === metadata.pcbCopperPourId,
      )
      if (
        via?.type !== "pcb_via" ||
        !pour ||
        pour.shape !== "brep" ||
        !transitions.some(
          (t) =>
            distance(t.point, via) < 1e-8 &&
            (t.fromLayer === segment.layer || t.toLayer === segment.layer),
        )
      )
        continue
      if (
        distance(segment.start, via) > 1e-8 &&
        distance(segment.end, via) > 1e-8
      )
        continue
      const ring = pour.brep_shape.inner_rings[metadata.innerRingIndex]
      if (
        !ring ||
        ring.vertices.some(
          (p) =>
            (p.bulge ?? 0) !== 0 ||
            distance(p, via) > metadata.maxRadiusMm + 1e-8,
        )
      )
        continue
      const hole = polygon(ring.vertices)
      if (
        !pointInCopper(via, hole) ||
        !pointInCopper(
          pointAt(segment.start, segment.end, (start + end) / 2),
          hole,
        )
      )
        continue
      // A merged hole containing multiple via centers or opening to the exterior is never an isolated clearance.
      if (
        circuitJson.filter(
          (e): e is Extract<AnyCircuitElement, { type: "pcb_via" }> =>
            e.type === "pcb_via" && pointInCopper(e, hole),
        ).length !== 1
      )
        continue
      if (
        area(difference(hole, polygon(pour.brep_shape.outer_ring.vertices))) >
        1e-12
      )
        continue
      const gapStrip = traceStrip(
        pointAt(segment.start, segment.end, start),
        pointAt(segment.start, segment.end, end),
        1e-7,
      )
      if (area(difference(gapStrip, hole)) > 1e-10) continue
      return metadata
    }
  }
  for (const trace of traces) {
    const sourceTrace = selectedSources.find(
      (t) => t.source_trace_id === trace.source_trace_id,
    )!
    const net = sourceConnectivity.traceNet(sourceTrace)
    const base: DdrLocation = {
      pcbTraceId: trace.pcb_trace_id,
      sourceTraceId: trace.source_trace_id,
      sourceNetId: net,
    }
    if (!net)
      add(
        "signal_net_unknown",
        "unknown",
        "DDR source trace net is absent or ambiguous.",
        base,
        [
          "Logical connectivity must resolve to one source_net_id; names are not substituted.",
        ],
        "Supply unambiguous source traces/net membership.",
      )
    const route = routeGeometry(trace)
    if (route.unsupported.length || !route.segments.length)
      add(
        "route_geometry_unknown",
        "unknown",
        "DDR route is incomplete or contains unsupported geometry.",
        base,
        route.unsupported.length
          ? route.unsupported
          : ["No nonzero wire segments."],
        "Supply supported complete wire/via route geometry.",
      )
    for (const segment of route.segments)
      for (const ref of referenceFor(segment.layer, {
        ...base,
        segmentIndex: segment.index,
      })) {
        const plane = locatePlane(ref, { ...base, segmentIndex: segment.index })
        if (!plane) continue
        const loc: DdrLocation = {
          ...base,
          layers: [segment.layer, ref.referenceLayer],
          pcbCopperPourIds: plane.pours.map((p) => p.pcb_copper_pour_id),
          segmentIndex: segment.index,
          start: segment.start,
          end: segment.end,
        }
        report.checks.referenceSegments++
        if (
          policy.requireAdjacentReference !== false &&
          Math.abs(
            stackup.copperLayers.indexOf(segment.layer) -
              stackup.copperLayers.indexOf(ref.referenceLayer),
          ) !== 1
        )
          add(
            "reference_not_adjacent",
            "policy_violation",
            "Assigned reference is not directly adjacent to this signal layer.",
            loc,
            [
              `Chosen direct-adjacency policy; ${segment.layer} references ${ref.referenceLayer}.`,
            ],
            "Review the assignment or route on a directly adjacent layer.",
          )
        const sourceNet = circuitJson.find(
          (e) => e.type === "source_net" && e.source_net_id === ref.sourceNetId,
        )
        const ground =
          sourceNet?.type === "source_net" &&
          (sourceNet as typeof sourceNet & { is_ground?: boolean })
            .is_ground === true
        const power =
          sourceNet?.type === "source_net" &&
          (sourceNet as typeof sourceNet & { is_power?: boolean }).is_power ===
            true
        if (!ground && !power)
          add(
            "reference_net_role_unknown",
            "unknown",
            "Reference net ground/power role is not declared.",
            loc,
            [`Net ${ref.sourceNetId}; no role inferred from its name.`],
            "Provide source_net is_ground/is_power metadata from the design.",
          )
        if (policy.preferGround !== false && power)
          add(
            "power_reference_policy",
            "policy_violation",
            "Power reference requires an explicit reviewed policy in this strict-ground analysis.",
            loc,
            [
              `${ref.sourceNetId} is declared power; this is a chosen conservative policy, not a universal DDR/manufacturer error.`,
            ],
            "Prefer ground, or select a reviewed power-reference policy and supply capacitive-return evidence.",
          )
        const gaps = uncoveredIntervals(
          segment.start,
          segment.end,
          plane.geometry,
        )
        for (const [start, end] of gaps) {
          const antipad = antipadFor(trace, segment, plane, start, end)
          add(
            antipad ? "isolated_signal_antipad" : "reference_coverage_gap",
            antipad ? "info" : model.unsupported.length ? "unknown" : "error",
            antipad
              ? "Bounded isolated clearance at the signal via is explicitly accounted for."
              : "DDR route crosses missing reference copper (hole, split, merged void, or plane edge).",
            {
              ...loc,
              start: pointAt(segment.start, segment.end, start),
              end: pointAt(segment.start, segment.end, end),
              ...(antipad ? { pcbViaIds: [antipad.pcbViaId] } : {}),
            },
            [
              `Continuous interval intersection: uncovered length ${Number((distance(segment.start, segment.end) * (end - start)).toFixed(6))} mm on ${ref.referenceLayer}.`,
              ...(antipad
                ? [
                    `Inner ring ${antipad.innerRingIndex}, bounded radius ${antipad.maxRadiusMm} mm; one via center, closed interior void.`,
                  ]
                : [
                    "Same-net labels do not fill holes or connect separate copper islands.",
                  ]),
            ],
            antipad
              ? "Keep this local clearance; separately review surrounding coverage and return transition."
              : "Reroute over continuous reference copper or repair/refill the reference region; preserve required antipads.",
            antipad ? [antipad.provenance] : [],
          )
        }
        if (!gaps.length) {
          add(
            "reference_centerline_covered",
            "info",
            "Continuous centerline coverage is established for this assigned reference.",
            loc,
            [
              "All straight polygon/hole boundary intervals covered by the union of supported final fill.",
            ],
            "Retain continuous copper; this check does not establish SI qualification.",
          )
          const coveredIslandProbes = plane.geometry.flatMap((poly) => {
            const gaps = uncoveredIntervals(segment.start, segment.end, [poly])
            const probes: DdrPoint[] = []
            let coveredStart = 0
            for (const [start, end] of [...gaps, [1, 1] as [number, number]]) {
              if (
                (start - coveredStart) * distance(segment.start, segment.end) >
                1e-8
              )
                probes.push(
                  pointAt(
                    segment.start,
                    segment.end,
                    (start + coveredStart) / 2,
                  ),
                )
              coveredStart = end
            }
            return probes
          })
          if (
            coveredIslandProbes.some(
              (point) => !model.anchors(plane, point).length,
            )
          )
            add(
              "reference_island_unanchored",
              model.unsupported.length ||
                !model.terminals(ref.sourceNetId).length
                ? "unknown"
                : "error",
              "Reference island has no modeled physical copper path to a declared reference terminal.",
              loc,
              [
                "Physical fill components, reference traces, supported pads and contacting via spans were traversed; equal net labels do not join disconnected islands.",
              ],
              "Connect the island to actual same-net reference terminals; include missing contact geometry before drawing hardware conclusions.",
            )
          const clearance = segmentCopperClearance(
            segment.start,
            segment.end,
            plane.geometry,
          )
          if (clearance <= 1e-8)
            add(
              "reference_boundary_contact_unknown",
              "unknown",
              "Route touches a zero-margin reference boundary; robust finite-width coverage is not established.",
              loc,
              [
                "Centerline boundary contact is not a positive-width copper corridor.",
              ],
              "Route inside a finite-width reference corridor or review the touching geometry.",
            )
          if (
            policy.minCopperClearanceMm !== undefined &&
            clearance < policy.minCopperClearanceMm
          )
            add(
              "narrow_reference_clearance",
              "warning",
              "Local reference copper clearance is below the chosen narrow-corridor policy.",
              loc,
              [
                `Minimum distance to actual fill/hole boundary ${Number(clearance.toFixed(6))} mm; policy minimum ${policy.minCopperClearanceMm} mm.`,
                "This is a geometric neck-risk warning; no loop inductance or whole-plane detour was computed.",
              ],
              "Widen the local reference corridor or route farther from void boundaries.",
            )
          if (policy.coverageMarginHeightFactor !== undefined) {
            if (ref.dielectricHeightMm === undefined)
              add(
                "dielectric_height_unknown",
                "unknown",
                "Height-scaled coverage margin is NOT EVALUATED because dielectric spacing is missing.",
                loc,
                [
                  "Board thickness cannot substitute for signal-to-reference spacing.",
                ],
                "Provide declared dielectric spacing or an explicitly assumed value.",
              )
            else {
              const margin =
                segment.width / 2 +
                policy.coverageMarginHeightFactor * ref.dielectricHeightMm
              const missing = area(
                difference(
                  traceStrip(segment.start, segment.end, margin),
                  plane.geometry,
                ),
              )
              if (missing > 1e-10)
                add(
                  "reference_margin_warning",
                  "warning",
                  "Reference copper does not cover the chosen height-scaled corridor.",
                  loc,
                  [
                    `Trace half-width + factor × height = ${segment.width / 2} + ${policy.coverageMarginHeightFactor} × ${ref.dielectricHeightMm} = ${margin} mm; uncovered corridor area ${Number(missing.toFixed(6))} mm².`,
                    "Configurable policy warning; not a proven field/current/loop-inductance result.",
                  ],
                  "Increase reference coverage or move the route; review the chosen factor.",
                )
            }
          }
        }
      }
    // Return targets use actual covered route intervals nearest the via, not its clearance-hole center.
    const probe = (
      layer: string,
      point: DdrPoint,
      plane: Plane,
    ): DdrPoint | undefined => {
      const segments = route.segments.filter(
        (s) =>
          s.layer === layer &&
          (distance(s.start, point) < 1e-8 || distance(s.end, point) < 1e-8),
      )
      for (const segment of segments) {
        const from =
          distance(segment.start, point) < 1e-8 ? segment.start : segment.end
        const to = from === segment.start ? segment.end : segment.start
        const gaps = uncoveredIntervals(from, to, plane.geometry)
        let coveredStart = 0
        for (const [start, end] of [...gaps, [1, 1] as [number, number]]) {
          if (start - coveredStart > 1e-8)
            return pointAt(from, to, (coveredStart + start) / 2)
          coveredStart = end
        }
      }
      return pointInCopper(point, plane.geometry) ? point : undefined
    }
    for (const transition of route.transitions) {
      if (transition.fromLayer === transition.toLayer) continue
      const loc: DdrLocation = {
        ...base,
        segmentIndex: transition.index,
        start: transition.point,
        layers: [transition.fromLayer, transition.toLayer],
      }
      const signalVias = circuitJson.filter(
        (e): e is Extract<AnyCircuitElement, { type: "pcb_via" }> =>
          e.type === "pcb_via" &&
          distance(e, transition.point) < 1e-8 &&
          (e.pcb_trace_id === trace.pcb_trace_id ||
            e.source_trace_id === trace.source_trace_id),
      )
      if (!signalVias.length)
        add(
          "signal_via_span_unknown",
          "unknown",
          "Signal transition lacks a physical pcb_via record, including possible final BGA entry/exit.",
          loc,
          [
            "Route from_layer/to_layer identifies routing transition, not physical drill span.",
          ],
          "Include the rendered physical signal via and its span.",
        )
      for (const signalVia of signalVias) {
        const span = viaSpan(signalVia, stackup)
        if (
          !span ||
          !span.includes(transition.fromLayer) ||
          !span.includes(transition.toLayer)
        )
          add(
            "signal_via_span_unknown",
            "unknown",
            "Signal via physical span is missing or inconsistent with its routing transition.",
            { ...loc, pcbViaIds: [signalVia.pcb_via_id] },
            [
              "Routing from/to layers are not substituted for physical barrel span.",
            ],
            "Supply consistent physical pcb_via span metadata.",
          )
      }
      for (const before of referenceFor(transition.fromLayer, loc))
        for (const after of referenceFor(transition.toLayer, loc)) {
          report.checks.referenceTransitions++
          const from = locatePlane(before, loc)
          const to = locatePlane(after, loc)
          if (!from || !to) continue
          const fromPoint = probe(transition.fromLayer, transition.point, from)
          const toPoint = probe(transition.toLayer, transition.point, to)
          const pairLoc = {
            ...loc,
            layers: [
              transition.fromLayer,
              transition.toLayer,
              before.referenceLayer,
              after.referenceLayer,
            ],
            pcbCopperPourIds: [...from.pours, ...to.pours].map(
              (p) => p.pcb_copper_pour_id,
            ),
            pcbViaIds: signalVias.map((v) => v.pcb_via_id),
          }
          if (!fromPoint || !toPoint) {
            add(
              "transition_reference_contact_unknown",
              "unknown",
              "Reference copper at one side of the transition cannot be established.",
              pairLoc,
              [
                "No covered route interval or covered endpoint at the transition.",
              ],
              "Restore/reference the entry and exit geometry, including final BGA fanout.",
            )
            continue
          }
          if (
            from === to &&
            model
              .planeConductors(from, fromPoint)
              .some((a) =>
                model
                  .planeConductors(to, toPoint)
                  .some((b) => model.connected(a, b)),
              )
          ) {
            add(
              "same_reference_transition",
              "info",
              "Both routing layers use the same physically connected reference; no additional stitching via is required by this check.",
              pairLoc,
              ["Same actual reference copper component/path on both sides."],
              "Preserve the existing reference continuity.",
            )
            continue
          }
          if (before.sourceNetId !== after.sourceNetId) {
            const reviewed = (options.capacitiveReturns ?? []).find(
              (cap) =>
                cap.review.trim() &&
                Number.isFinite(cap.maxDistanceMm) &&
                cap.maxDistanceMm >= 0 &&
                ((cap.fromReference.layer === before.referenceLayer &&
                  cap.fromReference.sourceNetId === before.sourceNetId &&
                  cap.toReference.layer === after.referenceLayer &&
                  cap.toReference.sourceNetId === after.sourceNetId) ||
                  (cap.toReference.layer === before.referenceLayer &&
                    cap.toReference.sourceNetId === before.sourceNetId &&
                    cap.fromReference.layer === after.referenceLayer &&
                    cap.fromReference.sourceNetId === after.sourceNetId)) &&
                circuitJson.some(
                  (e) =>
                    e.type === "source_component" &&
                    e.source_component_id === cap.sourceComponentId &&
                    e.ftype === "simple_capacitor",
                ) &&
                model
                  .capacitorContacts(cap.sourceComponentId, from, fromPoint)
                  .some((a) =>
                    model
                      .capacitorContacts(cap.sourceComponentId, to, toPoint)
                      .some(
                        (b) =>
                          a.sourcePort.source_port_id !==
                            b.sourcePort.source_port_id &&
                          distance(a.pcbPort, transition.point) <=
                            cap.maxDistanceMm &&
                          distance(b.pcbPort, transition.point) <=
                            cap.maxDistanceMm,
                      ),
                  ),
            )
            add(
              reviewed
                ? "reviewed_capacitive_return"
                : "capacitive_return_unknown",
              reviewed ? "warning" : "unknown",
              reviewed
                ? "A reviewed capacitor has physical terminal paths to both unlike reference nets."
                : "Unlike reference nets require reviewed capacitive-return evidence; no qualifying AC path is established.",
              pairLoc,
              [
                `Reference transition ${before.sourceNetId} → ${after.sourceNetId}; a conductive via must never short these rails.`,
                ...(reviewed
                  ? [
                      `Capacitor ${reviewed.sourceComponentId}; reviewed distance limit ${reviewed.maxDistanceMm} mm; bandwidth/ESL remains NOT EVALUATED.`,
                    ]
                  : []),
              ],
              reviewed
                ? "Retain the reviewed bypass path and separately validate its AC behavior."
                : "Add or identify a suitable reviewed bypass path and its real terminal-to-plane contacts; never bridge ground/power with a via.",
              reviewed ? [reviewed.review] : [],
            )
            continue
          }
          const candidates = model.vias.filter(
            (v) => !signalVias.some((s) => s.pcb_via_id === v.via.pcb_via_id),
          )
          const qualifying = candidates.filter(
            (c) =>
              c.conductors.some(
                (a) =>
                  a.plane === from &&
                  model
                    .planeConductors(from, fromPoint)
                    .some((node) => model.connected(a, node)),
              ) &&
              c.conductors.some(
                (b) =>
                  b.plane === to &&
                  model
                    .planeConductors(to, toPoint)
                    .some((node) => model.connected(b, node)),
              ),
          )
          const maxDistance = policy.maxReturnViaDistanceMm
          const nearby =
            maxDistance === undefined
              ? []
              : qualifying.filter(
                  (c) => distance(c.via, transition.point) <= maxDistance,
                )
          const evidence = candidates
            .map(
              (c) =>
                `${c.via.pcb_via_id}: distance ${Number(distance(c.via, transition.point).toFixed(6))} mm; ${c.reason ?? (!c.layers?.includes(before.referenceLayer) || !c.layers?.includes(after.referenceLayer) ? "wrong span" : !qualifying.includes(c) ? "no actual contact to both required reference islands" : "contacts both reference islands")}`,
            )
            .sort()
          if (maxDistance === undefined)
            add(
              "return_proximity_unknown",
              "unknown",
              "Reference changes, but no reviewed proximity policy is specified.",
              pairLoc,
              [
                `${qualifying.length} existing physical bridge candidate(s).`,
                ...evidence,
              ],
              "Select a justified return-via distance policy; no universal stitch distance is assumed.",
            )
          else if (nearby.length)
            add(
              "existing_return_connection",
              "info",
              "An existing nearby same-net via physically contacts both required reference planes.",
              {
                ...pairLoc,
                pcbViaIds: [
                  ...pairLoc.pcbViaIds,
                  ...nearby.map((c) => c.via.pcb_via_id),
                ],
              },
              [`Chosen maximum distance ${maxDistance} mm.`, ...evidence],
              "Retain the existing qualifying return connection; a redundant new stitch is unnecessary.",
            )
          else
            add(
              "return_connection_missing",
              model.unsupported.length ||
                candidates.some(
                  (c) =>
                    c.reason &&
                    distance(c.via, transition.point) <= maxDistance,
                )
                ? "unknown"
                : "policy_violation",
              "No existing return via qualifies under the chosen physical-contact/span/proximity policy.",
              pairLoc,
              [
                `Chosen maximum distance ${maxDistance} mm; no universal SI threshold is implied.`,
                ...evidence,
              ],
              "Move an existing same-net return via or provide a qualifying connection that spans and physically contacts both reference islands; verify clearance before adding copper.",
            )
        }
    }
    // Establish each source endpoint by explicit PCB-port identity and actual route point.
    for (const side of ["start", "end"] as const) {
      const p =
        side === "start" ? trace.route[0] : trace.route[trace.route.length - 1]
      if (
        !p ||
        p.route_type !== "wire" ||
        ![p.x, p.y, p.width].every(Number.isFinite) ||
        p.width <= 0
      ) {
        add(
          "endpoint_mapping_unknown",
          "unknown",
          "Final route endpoint/port geometry is missing or unsupported.",
          {
            ...base,
            segmentIndex:
              side === "start" ? 0 : Math.max(0, trace.route.length - 1),
          },
          [
            "Entry/exit via transitions were examined separately when supplied.",
          ],
          "Provide final wire endpoint with PCB port identity and package pad layer.",
        )
        continue
      }
      const pcbPortId =
        side === "start" ? p.start_pcb_port_id : p.end_pcb_port_id
      const pcbPort = circuitJson.find(
        (e) => e.type === "pcb_port" && e.pcb_port_id === pcbPortId,
      )
      const sourcePort =
        pcbPort?.type === "pcb_port"
          ? circuitJson.find(
              (e) =>
                e.type === "source_port" &&
                e.source_port_id === pcbPort.source_port_id,
            )
          : undefined
      const loc = {
        ...base,
        start: { x: p.x, y: p.y },
        pcbPortIds: pcbPortId ? [pcbPortId] : [],
        segmentIndex: side === "start" ? 0 : trace.route.length - 1,
      }
      if (
        pcbPort?.type !== "pcb_port" ||
        sourcePort?.type !== "source_port" ||
        !sourcePort.source_component_id ||
        !sourceTrace.connected_source_port_ids.includes(
          sourcePort.source_port_id,
        ) ||
        !pcbPort.layers.includes(p.layer) ||
        distance(pcbPort, p) > 1e-6
      ) {
        add(
          "endpoint_mapping_unknown",
          "unknown",
          "Endpoint component/port/layer cannot be established from the actual route.",
          loc,
          [
            `${side} endpoint requires matching PCB/source port ID, position and layer; no nearest-component guess.`,
          ],
          "Restore actual endpoint PCB/source port mappings.",
        )
        continue
      }
      const component = circuitJson.find(
        (e) =>
          e.type === "source_component" &&
          e.source_component_id === sourcePort.source_component_id,
      )
      for (const ref of referenceFor(p.layer, loc)) {
        const plane = locatePlane(ref, loc)
        if (!plane) continue
        report.checks.endpoints++
        const anchors = model.anchors(plane, p, sourcePort.source_component_id)
        const endpointLoc = {
          ...loc,
          component:
            component?.type === "source_component"
              ? component.name
              : sourcePort.source_component_id,
          layers: [p.layer, ref.referenceLayer],
          pcbCopperPourIds: plane.pours.map((pour) => pour.pcb_copper_pour_id),
        }
        if (anchors.length)
          add(
            "endpoint_reference_anchored",
            "info",
            "Endpoint component has an actual modeled copper path to the assigned reference island.",
            {
              ...endpointLoc,
              pcbPortIds: [
                ...endpointLoc.pcbPortIds,
                ...anchors.map((a) => a.pcbPort.pcb_port_id),
              ],
            },
            [
              `${side} endpoint reference terminals reached through positive copper contacts and physical via spans.`,
            ],
            "Retain this physical connection; package/internal SI remains outside this check.",
          )
        else
          add(
            "endpoint_reference_unanchored",
            model.unsupported.length ||
              !model.terminals(ref.sourceNetId, sourcePort.source_component_id)
                .length
              ? "unknown"
              : "error",
            "Endpoint component has no modeled physical path from its reference terminal to this reference island.",
            endpointLoc,
            [
              `${side} endpoint checked at actual route port; shared ground labels do not prove grounding.`,
            ],
            "Connect the endpoint's declared reference pad to the assigned plane with real same-net copper/via contact, or supply missing terminal geometry.",
          )
      }
    }
  }
  return finish()
}
