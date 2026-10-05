# DDR reference checks

`analyzeDdrPlacement(circuitJson, options)` accepts final rendered/imported Circuit JSON using existing `Circuit.getCircuitJson()` workflows. It returns `getString()` (Markdown), `getReport()` (stable localized findings, provenance, counts and limits), and `getIssues()` (non-informational findings). It never parses TSX or runs a router.

```ts
const analysis = analyzeDdrPlacement(circuit.getCircuitJson(), {
  groups: [{ name: "DQ", sourceNetIds: ["ddr_dq0"], provenance: "Design DDR group" }],
  stackup: {
    provenance: { kind: "assumed", source: "Caller-selected expected stack" },
    copperLayers: ["top", "inner1", "inner2", "bottom"],
    references: [
      { signalLayer: "top", referenceLayer: "inner1", sourceNetId: "ground" },
      { signalLayer: "bottom", referenceLayer: "inner2", sourceNetId: "ground" },
    ],
  },
  filledCopper: { pcbCopperPourIds: ["filled_inner1", "filled_inner2"], provenance: "Final solved fill export" },
  policy: { name: "project_review", provenance: "Reviewed for this design", maxReturnViaDistanceMm: 1 },
})
console.log(analysis.getString())
```

Replace illustrative IDs and distance with actual IDs and reviewed policy. `num_layers`, thickness, material, net names and equal net labels do not establish electrical references or physical grounding. Supply ordered layers and **every** assigned reference (both stripline sides when applicable). Missing/inconsistent stackup blocks reference conclusions; caller-selected expected stackups remain **ASSUMED** in every finding. DECLARED is supplied design metadata, not fabricated-hardware observation.

Coverage partitions straight routes at every boundary of the union of identified final filled copper, retaining holes and splits. Island grounding traverses positive-area pad/trace contacts and physical via annuli to declared source/PCB-port-linked reference terminals. A known disconnected terminal path is an error; missing grounding geometry is UNKNOWN. Return transitions, including final entry/exit vias, require an existing same-net via with known physical span and contact to both required reference islands. Sharing one connected reference needs no redundant stitch. Logical route `from_layer`/`to_layer` never substitutes for drill span. No universal proximity distance is supplied.

`signalViaAntipads` declares `{pcbViaId, pcbCopperPourId, innerRingIndex, maxRadiusMm, provenance}`. Only bounded closed BRep holes at an actual signal transition containing exactly one represented via center are exempt. Merged barriers, ordinary segment holes and oversized clearances remain coverage gaps. Preserve insulation rather than filling required antipads.

The default policy prefers ground and direct adjacency. Reviewed power-reference policy can set `preferGround: false`; unlike-net transitions remain UNKNOWN because capacitive return is **NOT EVALUATED**. Never bridge power and ground with a via. Straight polygons/BRep and rotated rectangles are supported; curved fill, through-pad routes, pill pads, plated holes, separate thermal spokes, marginal contacts and invalid numbers remain UNKNOWN where relevant. Input fill must already include solved holes, antipads and thermal clearances.

Errors describe supported topology/coverage; policy violations describe chosen preferences; unknowns retain missing evidence. No score or SI/EMI/timing/boot signoff is produced. **NOT EVALUATED:** endpoint component anchoring, capacitor/AC qualification, dielectric/height margins, narrow neck/detour behavior, package returns, manufacturer keepout/shielding or electrical qualification.

Five [visual snapshot fixtures](../tests/fixtures/ddr-visual.ts) compare actual Circuit JSON and analyzer reports: reference slit, existing return bridge, floating island, stackup provenance and invalid geometry. The SVGs are deterministic isometric schematics, not current or EM simulation. Run `bun test tests/ddr-visual-*.test.tsx`; package validation uses `bun test`, `bunx tsc --noEmit`, `bun run build` and `bun run format:check`.

[TI AM335x SPRS717L Rev L](https://www.ti.com/lit/ds/symlink/am3352.pdf), Table 7-62 printed p175, specifies adjacent references and zero crossings over reference cuts for that device; GND is preferred but VDDS_DDR references with bypass accommodation exist. DDR keepout p177 and bypass p178 are device-specific and not implemented. [TI SPRAAR7J](https://www.ti.com/lit/an/spraar7j/spraar7j.pdf), §2.4, discusses ground continuity and stitch placement; its 200 mil guidance is not a universal DDR threshold or an implemented manufacturer qualification profile.
