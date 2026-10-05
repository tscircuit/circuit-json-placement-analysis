# DDR placement and reference-path analysis

`analyzeDdrPlacement(circuitJson, options)` inspects a rendered/imported Circuit JSON model and produces Markdown plus localized structured findings. It does not render TSX, parse source text, run a router, or change the circuit. Use the existing `Circuit` render/import workflow, then pass `circuit.getCircuitJson()` or the final imported Circuit JSON array.

```ts
import { analyzeDdrPlacement } from "@tscircuit/circuit-json-placement-analysis"

const analysis = analyzeDdrPlacement(circuit.getCircuitJson(), {
  groups: [{
    name: "DQ",
    sourceNetIds: ["source_net_ddr_dq0"], // actual rendered IDs
    provenance: "Design's declared DDR data group",
  }],
  stackup: {
    provenance: { kind: "assumed", source: "Caller-selected expected six-layer stack" },
    copperLayers: ["top", "inner1", "inner2", "inner3", "inner4", "bottom"],
    references: [
      { signalLayer: "top", referenceLayer: "inner1", sourceNetId: "source_net_ground", dielectricHeightMm: 0.1 },
      { signalLayer: "bottom", referenceLayer: "inner4", sourceNetId: "source_net_ground", dielectricHeightMm: 0.1 },
    ],
  },
  filledCopper: {
    pcbCopperPourIds: ["pcb_copper_pour_filled_inner1", "pcb_copper_pour_filled_inner4"],
    provenance: "Final copper-fill export, including all holes/antipads/spokes",
  },
  policy: {
    name: "project_review",
    provenance: "Project's reviewed geometric policy",
    preferGround: true,
    requireAdjacentReference: true,
    coverageMarginHeightFactor: 3, // illustrative configurable policy, not a universal rule
    minCopperClearanceMm: 0.2,   // illustrative configurable policy
    // maxReturnViaDistanceMm: supply a distance justified for this design
  },
})

console.log(analysis.getString()) // Markdown
console.log(analysis.getReport()) // provenance, counts, localized stable findings, limits
console.log(analysis.getIssues()) // excludes informational evaluated-check results
```

Replace all example IDs and illustrative values with the actual model and reviewed policy. Net names such as GND or DDR_D0 never establish electrical role or DDR membership. Ground/power roles come from `source_net.is_ground` / `is_power`; source nets, source traces and ports resolve logical connectivity by IDs. Named groups select source net IDs or exact source trace IDs. No regex naming heuristic is used. Multiple unlike source nets in one logical connectivity group are ambiguous and remain UNKNOWN.

A `pcb_board.num_layers`, thickness or FR4 material value is insufficient to derive an electrical stackup. Supply ordered copper layers and **all** assigned references, including both sides of stripline. `declared` means design metadata supplied by the caller; `assumed` means a caller-selected expected stackup. Both retain their source. ASSUMED is printed in the report header and every finding; agreement with the layer count never upgrades it to observed hardware. Missing/contradictory stackup blocks physical reference conclusions. The implementation is dynamic across supported layer names/counts, with tests for two, four, six, eight and ten layers.

Only explicitly identified **final filled copper** is used for coverage. Requested rectangular pour regions can be unfilled outlines; passing them as final fill is a caller assertion, not something this package verifies. Include real holes, antipads, splits, board cutouts and solved thermal spokes. Rectangle rotation, concave straight polygons and BRep inner holes are supported. BRep curves (`bulge != 0`), through-pad routes, pill pads, plated holes and separate thermal-spoke elements remain UNKNOWN where they affect the reference model. No bounding box replaces unsupported copper geometry.

The checks establish:

- Continuous route-centerline coverage against the union of actual same-net fill. All straight boundary intersections partition the route; a slit between arbitrary sample locations is detected. Holes remain voids. Different-net fills are never unioned and positive overlaps are reported as a model short.
- Physical connectivity of reference islands through positive copper contacts of supported pads, reference traces and vias. Equal net labels do not connect islands. A modeled reference terminal is an actual source/PCB-port-linked pad, not a port coordinate alone. Absent terminal metadata is UNKNOWN; an existing represented terminal disconnected from an island is a modeled topological error.
- Reference-changing route vias, including final entry/exit vias. A qualifying existing same-net return via needs a known physical span and actual annulus contact with both required reference islands. Direct net IDs, source-trace ownership and PCB-trace ownership must agree. Drill-span metadata or a complete consecutive `pcb_via.layers` list establishes physical span; logical route-via `from_layer`/`to_layer` alone does not. Explicit drill bounds can expand endpoint-only layer lists. A change of routing layer sharing the same connected reference requires no redundant stitch.
- Endpoint component anchoring to the assigned reference island. Actual start/end PCB port ID, source component, source-trace membership, position and pad layer are required. Package-internal continuity is outside the check.
- Optional local copper-clearance and trace-width-plus-dielectric-height corridor policies. Dimensions and chosen thresholds are included. These warnings do not prove loop inductance or SI failure; whole-plane neck/detour analysis is outside V1.

No universal return-via distance is supplied. Omitting `maxReturnViaDistanceMm` makes proximity UNKNOWN at reference changes even when physical bridge candidates exist. Evidence lists the closest twelve candidates, states when more were evaluated, and gives span/contact rejection reasons. All candidate geometry is still considered for qualification.

`signalViaAntipads` can identify explicitly known local clearances using a physical signal via ID, pour ID, BRep inner-ring index, maximum radius and provenance. Exemptions require a bounded closed hole at the actual transition and exactly one represented via center. A hole containing multiple vias, extending outside the pour, crossing an ordinary wire segment, exceeding the supplied local extent, or containing only part of the uncovered interval is never exempted. Preserve normal antipads; repair routes/plane cuts rather than filling required clearances.

The default `strict_ground` policy prefers ground and direct adjacency. Power references trigger a **policy violation**, not a universal manufacturer error. A caller can set `preferGround: false` with reviewed policy provenance. An unlike-net transition still requires `capacitiveReturns`: reference layer/net pairs, a real capacitor's source component ID, reviewed distance, and review provenance. Both distinct capacitor terminals must have actual copper paths to the corresponding reference islands. The resulting warning records the reviewed physical evidence; capacitance/ESL/frequency qualification remains NOT EVALUATED. A conductive via must never short power and ground.

Findings distinguish `error` (supported model topology/coverage), `policy_violation` (chosen conservative policy), `warning` (geometric heuristic or reviewed AC-return limitation), `unknown`, and `info`. IDs depend on rule and canonical location, not prose or element order. Locations carry net/trace/component/port/pour/via IDs, affected layers and segment geometry in board-world mm (+X right, +Y up). Markdown escapes source labels and retains evidence, repair hints and provenance. No score is produced. `no_issues_in_evaluated_checks` is scoped to the supplied model and evaluated checks; it is not impedance, crosstalk, timing, EMI, boot or hardware signoff.

Generic original fixtures demonstrate the behavior without publishing any private board:

- [Before report](../tests/__snapshots__/ddr-before.md): a 0.1 mm reference slit and no nearby qualified main return connection.
- [After report](../tests/__snapshots__/ddr-after.md): repaired fill plus an existing return connection; the final BGA entry reuses the endpoint's existing ground via.
- [Before PCB snapshot](../tests/__snapshots__/ddr-rendered-report-before.snap.svg) and [after PCB snapshot](../tests/__snapshots__/ddr-rendered-report-after.snap.svg): native top signal view and inner1 final fill.

Validation: `bun test tests/ddr-placement.test.ts tests/ddr-rendered-report.test.tsx`; all package tests with `bun test`; `bunx tsc --noEmit`; `bun run build`; `bun run format:check`; changed-file lint with `bunx biome check lib/ddr lib/index.ts tests/ddr-placement.test.ts tests/ddr-rendered-report.test.tsx tests/fixtures/ddr.ts`.

## Technical reference context

These sources motivate the checks and their limits; this implementation does **not** claim their complete compliance profiles. [TI AM335x SPRS717L Rev L](https://www.ti.com/lit/ds/symlink/am3352.pdf), Table 7-62, printed p175, specifies directly adjacent references and zero DDR trace crossings over reference cuts for its DDR3 design; it prefers ground while also describing VDDS_DDR reference and bypass accommodation. The DDR keepout on printed p177 and bypass discussion on p178 are device-specific and are not implemented as generic placement rules. [TI SPRAAR7J](https://www.ti.com/lit/an/spraar7j/spraar7j.pdf), §2.4, discusses ground continuity and stitch placement. Its 200 mil guidance is not installed as a universal DDR threshold. Select an appropriate reviewed project/device policy instead.
