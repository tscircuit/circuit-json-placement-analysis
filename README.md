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

For two-pin components, the report can emit a `suboptimal_orientation` issue
when the nearest external destination on each pin's net lies across the
centerline between the pads and rotating 180 degrees shortens both nearest
connection distances. Connectivity includes direct traces and shared named nets;
destinations must share a copper layer with the pin. The suggested move
recommends rotating the component 180 degrees. This is a placement heuristic,
not a guarantee about the final routed trace length.

The summary string returned by `getString()` now starts with:

- A short failure summary
- The top worst issues sorted by severity
- Likely bad cluster groupings
- Per-part board-edge status using rendered bounds
- Focused details for flagged components
