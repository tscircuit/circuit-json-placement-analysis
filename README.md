# @tscircuit/circuit-json-placement-analysis

This package analyzes the placement of components in a circuit.json file.

It is used to help get a spatial understanding of a circuit in text form.

The spatial understanding is understood on a per-component basis. So the output
always focuses on one component at a time.

```tsx
import { analyzeComponentPlacement } from "@tscircuit/circuit-json-placement-analysis"

const analysis = analyzeComponentPlacement(circuitJson, "U1")

console.log(analysis.getString())
console.log(analysis.getLineItems())
```

To analyze all components in a circuit at once:

```tsx
import { analyzeAllPlacements } from "@tscircuit/circuit-json-placement-analysis"

const analysis = analyzeAllPlacements(circuitJson)

console.log(analysis.getString())
console.log(analysis.getLineItems())
console.log(analysis.getIssues())
console.log(analysis.getReport())
```

An analysis line item is a single statement regarding the placement. There are
different types of line items. The most basic line item is the absolute position
of a component:

```javascript
{
  line_item_type: "absolute_component_position",
  component_name: "U1",
  anchor_alignment: "center", // nine point anchor from circuit-json
  anchor_position: { x: number, y: number, layer: string },
}
```

`analyzeAllPlacements()` now also produces a board-level report intended for
decision-making:

```ts
const report = analysis.getReport()

report.summary.countsByType
// {
//   pad_overlap: 2,
//   off_board: 1,
//   connector_body_intrusion: 1,
// }

report.issues[0]
// {
//   type: "pad_overlap",
//   componentA: "USB1",
//   componentB: "C1",
//   clearance: -0.25,
//   severity: 330,
//   summary: "USB1 and C1 pad overlap by 0.25mm",
//   suggested_move: "move C1 0.25mm down",
// }
```

The report also identifies routed crossovers at symmetric, interchangeable
two-pin parts. When a trace changes layers to cross the other pin's route and a
180-degree component rotation would uncross and shorten both connections, the
report includes an `avoidable_via_by_rotation` issue:

```ts
{
  type: "avoidable_via_by_rotation",
  componentA: "C_BIAS_PRE1",
  clearance: 0,
  severity: 103.904,
  summary: "C_BIAS_PRE1 has crossed two-pin connections using 2 vias",
  avoidable_via_count: 2,
  suggested_pcb_rotation_delta_degrees: 180,
  related_pcb_trace_ids: ["pcb_trace_1", "pcb_trace_2"],
}
```

The summary string returned by `getString()` now starts with:

- A short failure summary
- The top worst issues sorted by severity
- Likely bad cluster groupings
- Per-part board-edge status using rendered bounds
- Focused details for flagged components
