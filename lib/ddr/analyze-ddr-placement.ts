import type { AnyCircuitElement, PcbTrace } from "circuit-json"
import { formatDdrPlacementReport } from "./format-ddr-report"
import {
  area,
  coveredIntervals,
  difference,
  distance,
  hasContact,
  pointAt,
  pointInCopper,
  polygon,
  segmentCopperClearance,
  traceStrip,
  uncoveredIntervals,
} from "./geometry"
import {
  type DdrSegment,
  elementsOfType,
  type Plane,
  ReferenceCopperModel,
  routeGeometry,
  SourceConnectivity,
  type ViaContact,
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
  "Only identified final filled copper with solved holes/antipads is evaluated; requested pour outlines are insufficient.",
  "Straight polygon/BRep and rotated rectangles are supported. Curved fill, through_pad routes, pill pads, plated holes and separate thermal spokes are UNKNOWN when present in the reference model.",
  "Positive-area copper contacts are required. Via annulus overlap is radial against actual filled polygons; circular terminal pads use conservative 128-sided polygons. Marginal/touching contact is UNKNOWN, not hardware continuity proof.",
  "All supplied reference assignments are examined, including both stripline sides. Missing assignments cannot be inferred.",
  "NOT EVALUATED: endpoint component anchoring, capacitive return, dielectric/height margins, narrow necks/detours, package returns, manufacturer keepout/shielding, impedance, crosstalk, timing, EMI or boot qualification.",
]

// Shared finding wording keeps rule evaluation focused on geometry and evidence.
const MESSAGES: Record<string, readonly [summary: string, repair: string]> = {
  ddr_membership_unknown: [
    "DDR membership is not established.",
    "Select source net/trace IDs from rendered Circuit JSON and provide provenance.",
  ],
  stackup_unknown: [
    "Electrical stackup and reference assignments are unknown; physical reference checks are NOT EVALUATED.",
    "Supply the declared design stackup or explicitly select an ASSUMED expected stackup.",
  ],
  stackup_inconsistent: [
    "Stackup metadata is inconsistent or ambiguous; reference checks are NOT EVALUATED.",
    "Correct the supplied stackup; layer counts are never silently reindexed.",
  ],
  policy_invalid: [
    "Invalid policy values; reference checks are NOT EVALUATED.",
    "Correct the chosen policy.",
  ],
  filled_copper_unknown: [
    "Final solved reference copper is not identified; coverage/contact checks are NOT EVALUATED.",
    "Provide final filled pour IDs and their render/import provenance.",
  ],
  selected_trace_missing: [
    "Selected DDR source trace is absent.",
    "Restore the rendered source trace or correct group membership.",
  ],
  selected_net_missing: [
    "Selected DDR net is absent.",
    "Restore the rendered source net or correct group membership.",
  ],
  ddr_route_missing: [
    "DDR source trace has no rendered PCB route.",
    "Render/import the final route before evaluation.",
  ],
  ddr_routes_unknown: [
    "No routed DDR traces were selected; no physical checks were evaluated.",
    "Supply explicit DDR membership and rendered routes.",
  ],
  reference_model_incomplete: [
    "Reference connectivity/fill model contains unsupported or missing geometry.",
    "Provide supported solved geometry; absence of contacts cannot be proved from this incomplete model.",
  ],
  reference_copper_short: [
    "Unlike reference nets physically overlap on one layer.",
    "Separate unlike rails and refill copper; never bridge power and ground with a via.",
  ],
  reference_assignment_unknown: [
    "Signal layer has no explicit reference assignment.",
    "Declare all assigned references, including both stripline sides.",
  ],
  reference_fill_unknown: [
    "Assigned reference has no supported identified final fill.",
    "Include supported final fill for the assigned reference.",
  ],
  signal_net_unknown: [
    "DDR source trace net is absent or ambiguous.",
    "Supply unambiguous source traces/net membership.",
  ],
  route_geometry_unknown: [
    "DDR route is incomplete or contains unsupported geometry.",
    "Supply supported complete wire/via route geometry.",
  ],
  reference_not_adjacent: [
    "Assigned reference is not directly adjacent to this signal layer.",
    "Review the assignment or route on a directly adjacent layer.",
  ],
  reference_net_role_unknown: [
    "Reference net ground/power role is missing or contradictory.",
    "Provide source_net is_ground/is_power metadata from the design.",
  ],
  power_reference_policy: [
    "Power reference requires an explicit reviewed policy in this strict-ground analysis.",
    "Prefer ground, or select an explicitly reviewed power-reference policy; capacitive return is NOT EVALUATED.",
  ],
  isolated_signal_antipad: [
    "Bounded isolated clearance at the signal via is explicitly accounted for.",
    "Keep this local clearance; separately review surrounding coverage and return transition.",
  ],
  reference_coverage_gap: [
    "DDR route crosses missing reference copper (hole, split, merged void, or plane edge).",
    "Reroute over continuous reference copper or repair/refill the reference region; preserve required antipads.",
  ],
  reference_centerline_covered: [
    "Continuous centerline coverage is established for this assigned reference.",
    "Retain continuous copper; this check does not establish SI qualification.",
  ],
  reference_island_unanchored: [
    "Reference island has no modeled physical copper path to a declared reference terminal.",
    "Connect the island to actual same-net reference terminals; include missing contact geometry before drawing hardware conclusions.",
  ],
  reference_boundary_contact_unknown: [
    "Route touches a zero-margin reference boundary; robust finite-width coverage is not established.",
    "Route inside a finite-width reference corridor or review the touching geometry.",
  ],
  signal_via_span_unknown: [
    "Signal transition physical via span is absent or inconsistent.",
    "Supply the physical pcb_via record and consistent drill span; route from/to is insufficient.",
  ],
  transition_reference_contact_unknown: [
    "Reference copper at one side of the transition cannot be established.",
    "Restore/reference the entry and exit geometry, including final BGA fanout.",
  ],
  same_reference_transition: [
    "Both routing layers use the same physically connected reference; no additional stitching via is required by this check.",
    "Preserve the existing reference continuity.",
  ],
  capacitive_return_unknown: [
    "Unlike-net capacitive return is NOT EVALUATED.",
    "Review a suitable bypass return path; never bridge power and ground with a via.",
  ],
  return_proximity_unknown: [
    "Reference changes, but no reviewed proximity policy is specified.",
    "Select a justified return-via distance policy; no universal stitch distance is assumed.",
  ],
  existing_return_connection: [
    "An existing nearby same-net via physically contacts both required reference planes.",
    "Retain the existing qualifying return connection; a redundant new stitch is unnecessary.",
  ],
  return_connection_missing: [
    "No existing return via qualifies under the chosen physical-contact/span/proximity policy.",
    "Move an existing same-net return via or provide a qualifying connection that spans and physically contacts both reference islands; verify clearance before adding copper.",
  ],
}
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
    checks: { referenceSegments: 0, referenceTransitions: 0 },
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
    location: DdrLocation,
    evidence: string[],
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
      summary: MESSAGES[code]![0],
      location: canonical,
      evidence,
      repairHint: MESSAGES[code]![1],
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
    add("ddr_membership_unknown", "unknown", {}, [
      "No complete explicit group selection; names and TSX text are not used to infer DDR.",
    ])
  if (!options.stackup) {
    add("stackup_unknown", "unknown", {}, [
      "pcb_board num_layers/thickness/material do not define electrical reference roles or dielectric spacing.",
    ])
    return finish()
  }
  const stackup = options.stackup
  const boards = elementsOfType(circuitJson, "pcb_board").filter(
    (e) => !e.is_subcircuit,
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
        r.signalLayer === r.referenceLayer,
    )
  if (invalidStack) {
    add("stackup_inconsistent", "unknown", {}, [
      "Validate unique ordered layers, actual board layer count and reference layer IDs.",
    ])
    return finish()
  }
  if (
    !policy.name.trim() ||
    !policy.provenance.trim() ||
    (policy.maxReturnViaDistanceMm !== undefined &&
      (!Number.isFinite(policy.maxReturnViaDistanceMm) ||
        policy.maxReturnViaDistanceMm < 0))
  ) {
    add("policy_invalid", "unknown", {}, [
      "The distance threshold must be finite nonnegative mm, with named provenance.",
    ])
    return finish()
  }
  if (
    !options.filledCopper?.provenance.trim() ||
    !options.filledCopper.pcbCopperPourIds.length
  ) {
    add("filled_copper_unknown", "unknown", {}, [
      "A requested pour outline does not establish copper after clearance/antipad solving.",
    ])
    return finish()
  }
  const sourceConnectivity = new SourceConnectivity(circuitJson)
  const sourceTraces = elementsOfType(circuitJson, "source_trace")
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
          { sourceTraceId: id },
          [`Selection: ${group.name}`],
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
          { sourceNetId: id },
          [`Selection: ${group.name}`],
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
        { sourceTraceId: sourceTrace.source_trace_id },
        ["Zero route geometry cannot establish reference coverage."],
      )
  if (!traces.length) {
    add("ddr_routes_unknown", "unknown", {}, [
      "An empty selection cannot produce a favorable report.",
    ])
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
      {},
      model.unsupported.slice().sort(),
    )
  for (const short of model.shorts)
    add(
      "reference_copper_short",
      "error",
      {
        layers: [short.a.layer],
        pcbCopperPourIds: [...short.a.pours, ...short.b.pours].map(
          (p) => p.pcb_copper_pour_id,
        ),
      },
      [
        `Positive-area copper intersection between ${short.a.net} and ${short.b.net}.`,
      ],
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
        { ...location, layers: [signalLayer] },
        [
          "Layer order alone does not determine the selected electrical reference.",
        ],
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
        { ...location, layers: [ref.signalLayer, ref.referenceLayer] },
        [`Reference net: ${ref.sourceNetId}.`],
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
        elementsOfType(circuitJson, "pcb_via").filter((e) =>
          pointInCopper(e, hole),
        ).length !== 1
      )
        continue
      const outer = polygon(pour.brep_shape.outer_ring.vertices)
      if (
        area(difference(hole, outer)) > 1e-12 ||
        ring.vertices.some(
          (p, i) =>
            segmentCopperClearance(
              p,
              ring.vertices[(i + 1) % ring.vertices.length]!,
              outer,
            ) <= 1e-8,
        )
      )
        continue
      // Separate raw rings can still describe one merged void; do not exempt a touching clearance.
      if (
        pour.brep_shape.inner_rings.some((other, i) => {
          if (i === metadata.innerRingIndex) return false
          const geometry = polygon(other.vertices)
          return (
            hasContact(hole, geometry) ||
            ring.vertices.some(
              (p, j) =>
                segmentCopperClearance(
                  p,
                  ring.vertices[(j + 1) % ring.vertices.length]!,
                  geometry,
                ) <= 1e-8,
            )
          )
        })
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
      add("signal_net_unknown", "unknown", base, [
        "Logical connectivity must resolve to one source_net_id; names are not substituted.",
      ])
    const route = routeGeometry(trace)
    if (route.unsupported.length || !route.segments.length)
      add(
        "route_geometry_unknown",
        "unknown",
        base,
        route.unsupported.length
          ? route.unsupported
          : ["No nonzero wire segments."],
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
          add("reference_not_adjacent", "policy_violation", loc, [
            `Chosen direct-adjacency policy; ${segment.layer} references ${ref.referenceLayer}.`,
          ])
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
        if (ground === power)
          add("reference_net_role_unknown", "unknown", loc, [
            `Net ${ref.sourceNetId}: ground=${ground}, power=${power}; no name inference.`,
          ])
        if (policy.preferGround !== false && power && !ground)
          add("power_reference_policy", "policy_violation", loc, [
            `${ref.sourceNetId} is declared power; this is a chosen conservative policy, not a universal DDR/manufacturer error.`,
          ])
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
            antipad ? [antipad.provenance] : [],
          )
        }
        for (const poly of plane.geometry)
          for (const [start, end] of coveredIntervals(
            segment.start,
            segment.end,
            [poly],
          )) {
            const point = pointAt(segment.start, segment.end, (start + end) / 2)
            if (!model.anchors(plane, point).length)
              add(
                "reference_island_unanchored",
                model.unsupported.length ||
                  !model.terminals(ref.sourceNetId).length
                  ? "unknown"
                  : "error",
                {
                  ...loc,
                  start: pointAt(segment.start, segment.end, start),
                  end: pointAt(segment.start, segment.end, end),
                },
                [
                  "Actual reference pads, traces and contacting via spans were traversed; equal net labels do not connect islands.",
                ],
              )
          }
        if (!gaps.length) {
          add("reference_centerline_covered", "info", loc, [
            "All straight polygon/hole boundary intervals covered by the union of supported final fill.",
          ])
          const clearance = segmentCopperClearance(
            segment.start,
            segment.end,
            plane.geometry,
          )
          if (clearance <= 1e-8)
            add("reference_boundary_contact_unknown", "unknown", loc, [
              "Centerline boundary contact is not a positive-width copper corridor.",
            ])
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
        const first = coveredIntervals(from, to, plane.geometry)[0]
        if (first) return pointAt(from, to, (first[0] + first[1]) / 2)
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
      const signalVias = elementsOfType(circuitJson, "pcb_via").filter(
        (e) =>
          distance(e, transition.point) < 1e-8 &&
          (e.pcb_trace_id === trace.pcb_trace_id ||
            e.source_trace_id === trace.source_trace_id),
      )
      if (!signalVias.length)
        add("signal_via_span_unknown", "unknown", loc, [
          "Route from_layer/to_layer identifies routing transition, not physical drill span.",
        ])
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
            { ...loc, pcbViaIds: [signalVia.pcb_via_id] },
            [
              "Routing from/to layers are not substituted for physical barrel span.",
            ],
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
            layers: [...loc.layers!, from.layer, to.layer],
            pcbCopperPourIds: [...from.pours, ...to.pours].map(
              (p) => p.pcb_copper_pour_id,
            ),
            pcbViaIds: signalVias.map((v) => v.pcb_via_id),
          }
          if (!fromPoint || !toPoint) {
            add("transition_reference_contact_unknown", "unknown", pairLoc, [
              "No covered route interval or covered endpoint at the transition.",
            ])
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
            add("same_reference_transition", "info", pairLoc, [
              "Same actual reference copper component/path on both sides.",
            ])
            continue
          }
          if (before.sourceNetId !== after.sourceNetId) {
            add("capacitive_return_unknown", "unknown", pairLoc, [
              `Reference transition ${before.sourceNetId} → ${after.sourceNetId}; physical capacitor/AC qualification is outside this analyzer.`,
            ])
            continue
          }
          const candidates = model.vias.filter(
            (v) => !signalVias.some((s) => s.pcb_via_id === v.via.pcb_via_id),
          )
          const touches = (c: ViaContact, plane: Plane, point: DdrPoint) =>
            c.conductors.some(
              (a) =>
                a.plane === plane &&
                model
                  .planeConductors(plane, point)
                  .some((node) => model.connected(a, node)),
            )
          const qualifying = candidates.filter(
            (c) => touches(c, from, fromPoint) && touches(c, to, toPoint),
          )
          const maxDistance = policy.maxReturnViaDistanceMm
          const nearby =
            maxDistance === undefined
              ? []
              : qualifying.filter(
                  (c) => distance(c.via, transition.point) <= maxDistance,
                )
          const nearest = candidates
            .slice()
            .sort(
              (a, b) =>
                distance(a.via, transition.point) -
                  distance(b.via, transition.point) ||
                a.via.pcb_via_id.localeCompare(b.via.pcb_via_id),
            )
            .slice(0, 12)
          const evidence = nearest.map(
            (c) =>
              `${c.via.pcb_via_id}: ${Number(distance(c.via, transition.point).toFixed(6))} mm; ${c.reason ?? `span ${c.layers?.join("/")}; contacts required islands ${touches(c, from, fromPoint)}/${touches(c, to, toPoint)}`}`,
          )
          if (candidates.length > nearest.length)
            evidence.push(
              `${candidates.length} candidates evaluated; closest ${nearest.length} shown.`,
            )
          if (maxDistance === undefined)
            add("return_proximity_unknown", "unknown", pairLoc, [
              `${qualifying.length} existing physical bridge candidate(s).`,
              ...evidence,
            ])
          else if (nearby.length)
            add(
              "existing_return_connection",
              "info",
              {
                ...pairLoc,
                pcbViaIds: [
                  ...pairLoc.pcbViaIds,
                  ...nearby.map((c) => c.via.pcb_via_id),
                ],
              },
              [`Chosen maximum distance ${maxDistance} mm.`, ...evidence],
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
              pairLoc,
              [
                `Chosen maximum distance ${maxDistance} mm; no universal SI threshold is implied.`,
                ...evidence,
              ],
            )
        }
    }
  }
  return finish()
}
