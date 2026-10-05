import { expect, test } from "bun:test"
import { analyzeDdrPlacement } from "../lib"
import {
  ddrFixture,
  fill,
  fixtureElement,
  hop,
  rectPoints,
  replaceElement,
  terminal,
  via,
  wires,
} from "./fixtures/ddr"

const codes = (result: ReturnType<typeof analyzeDdrPlacement>) =>
  result.getReport().findings.map((f) => f.code)
const remove = (
  elements: ReturnType<typeof ddrFixture>["elements"],
  id: string,
) => elements.filter((e) => !Object.values(e).includes(id))

test("existing correctly spanned/contacting ground via and actual endpoint ground anchors clear the modeled checks", () => {
  const { elements, options } = ddrFixture()
  const analysis = analyzeDdrPlacement(elements, options)
  expect(analysis.getReport().status).toBe("no_issues_in_evaluated_checks")
  expect(analysis.getIssues()).toEqual([])
  expect(codes(analysis)).toContain("existing_return_connection")
  expect(analysis.getReport().checks.endpoints).toBe(2)
  expect(analysis.getString()).toContain("redundant new stitch is unnecessary")
})
test("same-net disconnected islands are not grounded by labels", () => {
  const { elements, options } = ddrFixture()
  const broken = remove(elements, "existing_return")
  const left = fill(
    "ground_inner1",
    "inner1",
    "gnd",
    rectPoints(-10, -5, -0.2, 5),
  )
  const right = fill(
    "detached_inner1",
    "inner1",
    "gnd",
    rectPoints(0.2, -5, 10, 5),
  )
  options.filledCopper!.pcbCopperPourIds.push("detached_inner1")
  options.stackup!.references = [
    { signalLayer: "top", referenceLayer: "inner1", sourceNetId: "gnd" },
  ]
  const analysis = analyzeDdrPlacement(
    [
      ...replaceElement(broken, "ground_inner1", left).filter(
        (e) => e.type !== "pcb_trace",
      ),
      right,
      wires("top"),
    ],
    options,
  )
  expect(codes(analysis)).toContain("reference_coverage_gap")
  // A second route entirely above the detached same-net island must remain unanchored.
  const route = wires("top")
  route.pcb_trace_id = "island_route"
  route.route = [
    { route_type: "wire", x: 2, y: 0, layer: "top", width: 0.15 },
    { route_type: "wire", x: 8, y: 0, layer: "top", width: 0.15 },
  ]
  expect(
    codes(
      analyzeDdrPlacement(
        [
          ...replaceElement(broken, "ground_inner1", left).filter(
            (e) => e.type !== "pcb_trace",
          ),
          right,
          route,
        ],
        options,
      ),
    ),
  ).toContain("reference_island_unanchored")
})
test("hole-containing plane and a 0.01 mm slit crossing between samples are detected continuously", () => {
  const { elements, options } = ddrFixture()
  const filled = fill(
    "ground_inner1",
    "inner1",
    "gnd",
    rectPoints(-10, -5, 10, 5),
    [rectPoints(-4.105, -1, -4.095, 1)],
  )
  const analysis = analyzeDdrPlacement(
    replaceElement(elements, "ground_inner1", filled),
    options,
  )
  const gap = analysis
    .getIssues()
    .find((f) => f.code === "reference_coverage_gap")!
  expect(gap.severity).toBe("error")
  expect(gap.location.start!.x).toBeCloseTo(-4.105, 8)
  expect(gap.location.end!.x).toBeCloseTo(-4.095, 8)
})
test("wrong-span stitch and non-contacting stitch are rejected with physical evidence", () => {
  const { elements, options } = ddrFixture()
  const wrong = replaceElement(
    elements,
    "existing_return",
    via("existing_return", 0, 0.7, ["top", "inner1", "inner2"]),
  )
  const rejected = analyzeDdrPlacement(wrong, options)
  expect(codes(rejected)).toContain("return_connection_missing")
  expect(rejected.getString()).toContain(
    "existing_return: distance 0.7 mm; wrong span",
  )
  const noContact = fill(
    "ground_inner4",
    "inner4",
    "gnd",
    rectPoints(-10, -5, 10, 5),
    [rectPoints(-0.4, 0.3, 0.4, 1.1)],
  )
  const analysis = analyzeDdrPlacement(
    replaceElement(elements, "ground_inner4", noContact),
    options,
  )
  expect(analysis.getString()).toContain(
    "existing_return: distance 0.7 mm; no actual contact to both required reference islands",
  )
})
test("a via annulus may contact fill around its own drill hole even when its center is not copper", () => {
  const { elements, options } = ddrFixture()
  for (const id of ["ground_inner1", "ground_inner4"]) {
    const layer = id === "ground_inner1" ? "inner1" : "inner4"
    const replacement = fill(id, layer, "gnd", rectPoints(-10, -5, 10, 5), [
      rectPoints(-0.125, 0.575, 0.125, 0.825),
    ])
    const i = elements.findIndex(
      (e) => e.type === "pcb_copper_pour" && e.pcb_copper_pour_id === id,
    )
    elements[i] = replacement
  }
  expect(codes(analyzeDdrPlacement(elements, options))).toContain(
    "existing_return_connection",
  )
})
test("same-reference layer change uses the physically continuous shared reference", () => {
  const { elements, options } = ddrFixture()
  options.stackup!.references = [
    { signalLayer: "top", referenceLayer: "inner1", sourceNetId: "gnd" },
    { signalLayer: "inner2", referenceLayer: "inner1", sourceNetId: "gnd" },
  ]
  const routed = replaceElement(
    remove(elements, "existing_return"),
    "ddr_route",
    hop("top", "inner2"),
  )
  const result = analyzeDdrPlacement(routed, options)
  expect(codes(result)).toContain("same_reference_transition")
  expect(codes(result)).not.toContain("return_connection_missing")
})
test("GND to power transition requires capacitive return and never recommends a rail-short via", () => {
  const { elements, options } = ddrFixture()
  options.stackup!.references[1]!.sourceNetId = "power"
  const result = analyzeDdrPlacement(
    replaceElement(
      elements,
      "ground_inner4",
      fill("ground_inner4", "inner4", "power"),
    ),
    options,
  )
  expect(codes(result)).toContain("capacitive_return_unknown")
  expect(
    result.getIssues().find((f) => f.code === "power_reference_policy")!
      .severity,
  ).toBe("policy_violation")
  expect(result.getString()).toContain("never bridge ground/power with a via")
  options.policy!.preferGround = false
  expect(
    codes(
      analyzeDdrPlacement(
        replaceElement(
          elements,
          "ground_inner4",
          fill("ground_inner4", "inner4", "power"),
        ),
        options,
      ),
    ),
  ).not.toContain("power_reference_policy")
})
test("reviewed capacitor requires physical terminal-to-reference paths on unlike nets", () => {
  const { elements, options } = ddrFixture()
  options.policy!.preferGround = false
  options.stackup!.references[1]!.sourceNetId = "power"
  const copper = replaceElement(
    elements,
    "ground_inner4",
    fill("ground_inner4", "inner4", "power"),
  )
  copper.push(
    fixtureElement({
      type: "source_component",
      source_component_id: "bypass",
      name: "C1",
      ftype: "simple_capacitor",
      capacitance: 1e-7,
    }),
    ...terminal("bypass", "cap_gnd", -0.4, 0.8, "inner1", "gnd"),
    ...terminal("bypass", "cap_power", 0.4, 0.8, "inner4", "power"),
  )
  options.capacitiveReturns = [
    {
      sourceComponentId: "bypass",
      fromReference: { layer: "inner1", sourceNetId: "gnd" },
      toReference: { layer: "inner4", sourceNetId: "power" },
      maxDistanceMm: 1,
      review:
        "Generic synthetic review: physical terminals; bandwidth separately required",
    },
  ]
  expect(codes(analyzeDdrPlacement(copper, options))).toContain(
    "reviewed_capacitive_return",
  )
  expect(
    codes(analyzeDdrPlacement(remove(copper, "pad_cap_power"), options)),
  ).toContain("capacitive_return_unknown")
})
test("missing stackup blocks conclusions; explicit assumed stackup labels every finding", () => {
  const { elements, options } = ddrFixture()
  const without = analyzeDdrPlacement(elements, {
    ...options,
    stackup: undefined,
  })
  expect(without.getReport().checks.referenceSegments).toBe(0)
  expect(without.getReport().status).toBe("incomplete")
  expect(codes(without)).toEqual(["stackup_unknown"])
  options.stackup!.provenance = {
    kind: "assumed",
    source: "Caller expected six-layer order; not verified",
  }
  const assumed = analyzeDdrPlacement(elements, options)
  expect(assumed.getString()).toContain("**ASSUMED**")
  expect(
    assumed
      .getReport()
      .findings.every((f) =>
        f.provenance.some((p) => p.startsWith("ASSUMED stackup:")),
      ),
  ).toBe(true)
})
test("layer-count mismatch and invalid dielectric spacing stay unknown", () => {
  const { elements, options } = ddrFixture()
  options.stackup!.copperLayers.pop()
  expect(codes(analyzeDdrPlacement(elements, options))).toContain(
    "stackup_inconsistent",
  )
  const valid = ddrFixture()
  valid.options.stackup!.references[0]!.dielectricHeightMm = Number.NaN
  expect(codes(analyzeDdrPlacement(valid.elements, valid.options))).toContain(
    "stackup_inconsistent",
  )
})
test("merged antipad barrier is never exempted as a legitimate via clearance", () => {
  const { elements, options } = ddrFixture()
  const hole = rectPoints(-0.5, -0.5, 0.5, 0.5)
  const copper = replaceElement(
    elements,
    "ground_inner1",
    fill("ground_inner1", "inner1", "gnd", rectPoints(-10, -5, 10, 5), [hole]),
  )
  copper.push(via("neighbor_signal", -0.2, 0, ["top", "inner1"], "ddr"))
  options.signalViaAntipads = [
    {
      pcbViaId: "signal_via",
      pcbCopperPourId: "ground_inner1",
      innerRingIndex: 0,
      maxRadiusMm: 1,
      provenance: "Generic declared signal clearance",
    },
  ]
  const result = analyzeDdrPlacement(copper, options)
  expect(codes(result)).toContain("reference_coverage_gap")
  expect(codes(result)).not.toContain("isolated_signal_antipad")
})
test("isolated bounded signal-via antipad is accounted for while ordinary segment holes remain gaps", () => {
  const { elements, options } = ddrFixture()
  const copper = replaceElement(
    elements,
    "ground_inner1",
    fill("ground_inner1", "inner1", "gnd", rectPoints(-10, -5, 10, 5), [
      rectPoints(-0.2, -0.2, 0.2, 0.2),
    ]),
  )
  options.signalViaAntipads = options.signalViaAntipads!.map((metadata) =>
    metadata.pcbCopperPourId === "ground_inner1"
      ? { ...metadata, provenance: "Generic declared local antipad" }
      : metadata,
  )
  expect(codes(analyzeDdrPlacement(copper, options))).toContain(
    "isolated_signal_antipad",
  )
  expect(codes(analyzeDdrPlacement(copper, options))).not.toContain(
    "reference_coverage_gap",
  )
  const long = replaceElement(copper, "ddr_route", wires("top"))
  expect(codes(analyzeDdrPlacement(long, options))).toContain(
    "reference_coverage_gap",
  )
})
test("narrow neck and height-scaled margin produce policy warnings with dimensions", () => {
  const { elements, options } = ddrFixture()
  const neck = fill("ground_inner1", "inner1", "gnd", [
    { x: -10, y: -5 },
    { x: -1, y: -5 },
    { x: -1, y: -0.1 },
    { x: 1, y: -0.1 },
    { x: 1, y: -5 },
    { x: 10, y: -5 },
    { x: 10, y: 5 },
    { x: 1, y: 5 },
    { x: 1, y: 0.1 },
    { x: -1, y: 0.1 },
    { x: -1, y: 5 },
    { x: -10, y: 5 },
  ])
  const result = analyzeDdrPlacement(
    replaceElement(elements, "ground_inner1", neck),
    options,
  )
  expect(
    result.getIssues().find((f) => f.code === "narrow_reference_clearance")!
      .severity,
  ).toBe("warning")
  expect(result.getString()).toContain("0.1 mm; policy minimum 0.2 mm")
  expect(codes(result)).toContain("reference_margin_warning")
})
test("endpoint anchor disconnected by antipad must fail despite its ground net label", () => {
  const { elements, options } = ddrFixture()
  const copper = replaceElement(
    elements,
    "ground_inner1",
    fill("ground_inner1", "inner1", "gnd", rectPoints(-10, -5, 10, 5), [
      rectPoints(-8.4, 0.6, -7.6, 1.4),
    ]),
  )
  expect(
    analyzeDdrPlacement(copper, options)
      .getIssues()
      .find(
        (f) =>
          f.code === "endpoint_reference_unanchored" &&
          f.location.component === "U1",
      )!.severity,
  ).toBe("error")
  expect(
    codes(analyzeDdrPlacement(remove(elements, "pad_ground_a"), options)),
  ).toContain("endpoint_reference_unanchored")
})
test("dual-sided references are all checked; overlapping same-net fills union, unlike nets flag a short", () => {
  const { elements, options } = ddrFixture()
  options.stackup!.references.push(
    { signalLayer: "inner2", referenceLayer: "inner1", sourceNetId: "gnd" },
    { signalLayer: "inner2", referenceLayer: "inner3", sourceNetId: "gnd" },
  )
  options.filledCopper!.pcbCopperPourIds.push("dual_ref")
  const routed = replaceElement(
    replaceElement(elements, "ddr_route", wires("inner2")),
    "ground_inner1",
    fill("ground_inner1", "inner1"),
  )
  routed.push(
    fill("dual_ref", "inner3", "gnd", rectPoints(-10, -5, 10, 5), [
      rectPoints(-0.3, -1, 0.3, 1),
    ]),
  )
  expect(
    analyzeDdrPlacement(routed, options)
      .getIssues()
      .find((f) => f.code === "reference_coverage_gap")!.location.layers,
  ).toContain("inner3")
  const overlap = ddrFixture()
  overlap.options.filledCopper!.pcbCopperPourIds.push("overlap")
  const united = replaceElement(
    overlap.elements,
    "ground_inner1",
    fill("ground_inner1", "inner1", "gnd", rectPoints(-10, -5, -3, 5)),
  )
  united.push(fill("overlap", "inner1", "gnd", rectPoints(-4, -5, 10, 5)))
  expect(codes(analyzeDdrPlacement(united, overlap.options))).not.toContain(
    "reference_coverage_gap",
  )
  const wrongNet = replaceElement(
    united,
    "overlap",
    fill("overlap", "inner1", "power", rectPoints(-4, -5, 10, 5)),
  )
  expect(codes(analyzeDdrPlacement(wrongNet, overlap.options))).toContain(
    "reference_copper_short",
  )
})
test("unsupported curved fill and through-pad routes cannot generate a clear report", () => {
  const { elements, options } = ddrFixture()
  const curved = fill("ground_inner1", "inner1")
  if (curved.shape !== "brep") throw new Error("Fixture requires BRep")
  curved.brep_shape.outer_ring.vertices[0]!.bulge = 0.5
  expect(
    codes(
      analyzeDdrPlacement(
        replaceElement(elements, "ground_inner1", curved),
        options,
      ),
    ),
  ).toContain("reference_model_incomplete")
  const route = hop()
  route.route.splice(1, 0, {
    route_type: "through_pad",
    start: { x: -1, y: 0 },
    end: { x: 0, y: 0 },
    width: 0.15,
    start_layer: "top",
    end_layer: "top",
  })
  expect(
    codes(
      analyzeDdrPlacement(
        replaceElement(elements, "ddr_route", route),
        options,
      ),
    ),
  ).toContain("route_geometry_unknown")
})
test("unknowns are not rewarded and findings remain stable under element reorder", () => {
  const { elements, options } = ddrFixture()
  const analysis = analyzeDdrPlacement(elements, options)
  expect(
    analyzeDdrPlacement(elements.slice().reverse(), options)
      .getReport()
      .findings.map((f) => f.id),
  ).toEqual(analysis.getReport().findings.map((f) => f.id))
  expect(analyzeDdrPlacement([], options).getReport().status).toBe("incomplete")
  expect(
    codes(analyzeDdrPlacement(remove(elements, "ddr_route"), options)),
  ).toContain("ddr_route_missing")
  expect(
    codes(
      analyzeDdrPlacement(elements, { ...options, filledCopper: undefined }),
    ),
  ).toContain("filled_copper_unknown")
  const omittedPolicy = {
    ...options,
    policy: { name: "caller", provenance: "No distance supplied" },
  }
  expect(codes(analyzeDdrPlacement(elements, omittedPolicy))).toContain(
    "return_proximity_unknown",
  )
  options.groups![0]!.name = "DQ|\n# forged"
  expect(analyzeDdrPlacement(elements, options).getString()).toContain(
    "DQ&#124; # forged",
  )
})

test("nonfinite adjacent route geometry stays UNKNOWN without throwing or asserting physical gaps", () => {
  for (const field of ["x", "y", "width"] as const) {
    const { elements, options } = ddrFixture()
    const route = wires("top")
    const end = route.route[1]!
    if (end.route_type !== "wire") throw new Error("Fixture wire missing")
    end[field] = Number.NaN
    const result = analyzeDdrPlacement(
      replaceElement(elements, "ddr_route", route),
      options,
    )
    expect(codes(result)).toContain("route_geometry_unknown")
    expect(result.getIssues().some((f) => f.severity === "error")).toBe(false)
    expect(result.getReport().status).toBe("incomplete")
  }
})
test("ordinary routed return via follows pcb_trace_id and contradictory ownership becomes UNKNOWN", () => {
  const { elements, options } = ddrFixture()
  const returnVia = via(
    "existing_return",
    0,
    0.7,
    options.stackup!.copperLayers,
  )
  delete returnVia.source_net_id
  returnVia.pcb_trace_id = "reference_trace"
  const refTrace = fixtureElement({
    type: "pcb_trace",
    pcb_trace_id: "reference_trace",
    source_trace_id: "source_ground_a",
    route: [],
  })
  const fixed = [
    ...replaceElement(elements, "existing_return", returnVia),
    refTrace,
  ]
  expect(codes(analyzeDdrPlacement(fixed, options))).toContain(
    "existing_return_connection",
  )
  returnVia.source_net_id = "power"
  const result = analyzeDdrPlacement(fixed, options)
  expect(
    result.getIssues().find((f) => f.code === "return_connection_missing")!
      .severity,
  ).toBe("unknown")
})
test("missing grounding metadata is UNKNOWN, while physically disconnected modeled reference pads are errors", () => {
  const { elements, options } = ddrFixture()
  const without = elements.filter(
    (e) =>
      !Object.values(e).some(
        (v) =>
          typeof v === "string" &&
          (v === "ground_a" ||
            v === "ground_b" ||
            v.startsWith("pad_ground_") ||
            v.startsWith("source_ground_")),
      ),
  )
  const result = analyzeDdrPlacement(without, options)
  expect(
    result
      .getIssues()
      .filter((f) => f.code === "reference_island_unanchored")
      .every((f) => f.severity === "unknown"),
  ).toBe(true)
  expect(
    result
      .getIssues()
      .filter((f) => f.code === "endpoint_reference_unanchored")
      .every((f) => f.severity === "unknown"),
  ).toBe(true)
})
test("caller stack order handles two, four, six, eight and ten layers without a fixed board profile", () => {
  for (const count of [2, 4, 6, 8, 10]) {
    const { elements, options } = ddrFixture()
    options.stackup!.copperLayers = [
      "top",
      ...Array.from({ length: count - 2 }, (_, i) => `inner${i + 1}`),
      "bottom",
    ]
    options.stackup!.references = [
      {
        signalLayer: "top",
        referenceLayer: count === 2 ? "bottom" : "inner1",
        sourceNetId: "gnd",
      },
    ]
    options.filledCopper!.pcbCopperPourIds = ["only_ref"]
    options.signalViaAntipads = []
    const generic = elements.filter(
      (e) =>
        !["pcb_board", "pcb_trace", "pcb_via", "pcb_copper_pour"].includes(
          e.type,
        ),
    )
    generic.push(
      fixtureElement({
        type: "pcb_board",
        pcb_board_id: "board",
        center: { x: 0, y: 0 },
        width: 20,
        height: 10,
        num_layers: count,
      }),
      wires("top"),
      fill("only_ref", count === 2 ? "bottom" : "inner1"),
      via("ground_anchor", -8, 1, options.stackup!.copperLayers),
    )
    const result = analyzeDdrPlacement(generic, options)
    expect(codes(result)).not.toContain("stackup_inconsistent")
    expect(result.getReport().checks.referenceSegments).toBe(1)
  }
})
test("explicit drill span expands endpoints-only layers, while missing physical span stays UNKNOWN", () => {
  const { elements, options } = ddrFixture()
  const physical = via("existing_return", 0, 0.7, ["top", "bottom"])
  Object.assign(physical, {
    topmost_drill_layer: "top",
    bottommost_drill_layer: "bottom",
  })
  expect(
    codes(
      analyzeDdrPlacement(
        replaceElement(elements, "existing_return", physical),
        options,
      ),
    ),
  ).toContain("existing_return_connection")
  delete (physical as typeof physical & { topmost_drill_layer?: string })
    .topmost_drill_layer
  delete (physical as typeof physical & { bottommost_drill_layer?: string })
    .bottommost_drill_layer
  expect(
    analyzeDdrPlacement(
      replaceElement(elements, "existing_return", physical),
      options,
    )
      .getIssues()
      .find((f) => f.code === "return_connection_missing")!.severity,
  ).toBe("unknown")
})

test("Infinity, zero-width and underspecified polygon/pad inputs are UNKNOWN without exceptions", () => {
  for (const bad of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0]) {
    const { elements, options } = ddrFixture()
    const route = wires("top")
    if (route.route[1]!.route_type !== "wire")
      throw new Error("Fixture wire missing")
    route.route[1]!.width = bad
    expect(
      codes(
        analyzeDdrPlacement(
          replaceElement(elements, "ddr_route", route),
          options,
        ),
      ),
    ).toContain("route_geometry_unknown")
  }
  const { elements, options } = ddrFixture()
  const tooFew = fill("ground_inner1", "inner1", "gnd", [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ])
  expect(
    codes(
      analyzeDdrPlacement(
        replaceElement(elements, "ground_inner1", tooFew),
        options,
      ),
    ),
  ).toContain("reference_model_incomplete")
  const pad = elements.find(
    (e) => e.type === "pcb_smtpad" && e.pcb_smtpad_id === "pad_ground_a",
  )!
  if (pad.type !== "pcb_smtpad" || pad.shape !== "circle")
    throw new Error("Fixture pad missing")
  pad.x = Number.NaN
  expect(codes(analyzeDdrPlacement(elements, options))).toContain(
    "reference_model_incomplete",
  )
})

test("warning-only reports identify issues instead of claiming no issues", () => {
  const { elements, options } = ddrFixture()
  options.policy!.minCopperClearanceMm = 6
  const noAntipads = replaceElement(
    replaceElement(elements, "ground_inner1", fill("ground_inner1", "inner1")),
    "ground_inner4",
    fill("ground_inner4", "inner4"),
  )
  const result = analyzeDdrPlacement(noAntipads, options)
  expect(result.getIssues().some((f) => f.severity === "warning")).toBe(true)
  expect(result.getReport().status).toBe("issues_found")
})
