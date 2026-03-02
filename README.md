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

An analysis line item is a single statement regarding the placement. There are
different types of line items. The most basic line item is the absolute position
of a component:

```javascript
{
  line_item_type: "absolute_position",
  component_name: "U1",
  anchor_alignment: "center", // nine point anchor from circuit-json
  anchor_position: { x: number, y: number, layer: string },
}
```
