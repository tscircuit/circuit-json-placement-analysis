# DDR reference screening

```ts
const analysis = analyzeDdrPlacement(circuit.getCircuitJson())
console.log(analysis.getString())
```

The single input is rendered/imported Circuit JSON. `getString()` gives short Markdown: what needs attention, its physical location, and one next step. `getReport()` retains stable findings, full geometry, evidence, assumptions and limits; `getIssues()` returns non-informational findings. The analyzer never parses TSX or runs a router.

For stepping, use `new DdrPlacementSolver(circuit.getCircuitJson())`. Its BaseSolver `step()` and `solve()` run the same evaluation; `visualize()` returns the current GraphicsObject. Stages are input, references, copper, coverage, transitions and report. `getState()` exposes only completed work, new findings, clipped copper and physical via contacts. `solved` means screening ended; a blocked UNKNOWN or conditional report is not electrical qualification. Consumed records are validated without modifying/defaulting the export. Unsupported inputs stop at one clear reason while retaining findings from completed work.

This version screens **signal candidates**: rendered source-connected routes excluding nets explicitly marked ground/power. It cannot identify DDR protocol membership from names. Missing or ambiguous connectivity remains UNKNOWN.

A consistent owning-board count of 2–10 copper layers permits an **ASSUMED** conventional order (`top`, `inner1`…`bottom`). Both immediate neighboring layers are examined for reference candidates using actual `source_net.is_ground`/`is_power` roles and pours. Ground is preferred; a distant power pour on the same layer is not another required reference. Multiple ground domains, contradictory/missing roles, inconsistent layer counts or missing copper remain UNKNOWN. Material, thickness and net names establish neither reference assignments nor dielectric spacing/Er. Electrical reference choices and the assumption that exported pours contain the final solved fill remain visible in the report; a healthy screen is conditional and has structured status `incomplete`.

Coverage partitions straight routes across actual polygon/BRep boundaries, preserving holes and splits. Reference-island connectivity uses positive-area pad/trace contacts and physical via annuli to declared source/PCB-port-linked reference terminals. Equal net labels do not connect islands. Missing terminal/contact data remains UNKNOWN; a disconnected island under an assumed reference produces a warning. Actual overlapping different-net reference copper is an error.

Layer changes, including final entry/exit vias, check for an **existing** same-net bridge with a known physical span and contact to both required islands. Sharing one connected reference needs no extra stitch. Logical route `from_layer`/`to_layer` does not replace drill-span metadata. The internal **1 mm advisory screen** is not an electrical limit: a qualified farther bridge produces only a distance warning, not a missing-bridge finding. Power references trigger a ground-preference policy finding; unlike-net transitions stay UNKNOWN because capacitive return is not evaluated. Never bridge power and ground with a via.

The internal **0.5 mm advisory radius** allows a small isolated BRep hole only at an actual signal-via transition. It must be closed, strictly interior, separated from other holes, and contain exactly one represented via center. Edge-open, touching/merged or oversized clearances remain coverage gaps. Preserve required insulation.

Straight polygons/BRep and rotated rectangles are supported. Curved fill, through-pad routes, pill pads, plated holes, separate thermal spokes, marginal contacts and invalid numbers remain UNKNOWN where relevant. **NOT EVALUATED:** endpoint component anchoring, capacitor/AC qualification, dielectric/height margins, narrow necks/detours, package returns, manufacturer keepout/shielding, impedance, crosstalk, timing, EMI or boot qualification. There is no score or hardware signoff.

Five [stage fixtures](../tests/fixtures/ddr-stages.ts) render actual TSX through core, then inspect the unchanged Circuit JSON: intact copper, a split, a floating island, and missing/existing return bridges. The snapshots show completed solver phases, not current or EM simulation. Run the local Play/Step/Reset demo with `bun examples/ddr-stages.tsx`. Run `bun test tests/ddr-stages-*.test.tsx`; package checks use `bun test`, `bunx tsc --noEmit`, `bun run build` and `bun run format:check`.

[TI AM335x SPRS717L Rev L](https://www.ti.com/lit/ds/symlink/am3352.pdf), Table 7-62 printed p175, specifies adjacent references and zero crossings over reference cuts for that device; GND is preferred but VDDS_DDR references with bypass accommodation exist. Its keepout/bypass requirements are not implemented. [TI SPRAAR7J](https://www.ti.com/lit/an/spraar7j/spraar7j.pdf), §2.4, discusses ground continuity and stitch placement; its 200 mil guidance is not a universal threshold or an implemented qualification profile.
