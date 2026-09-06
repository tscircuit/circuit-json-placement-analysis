import type { analyzeAllPlacements } from "../../lib/index"

type Circuit = Parameters<typeof analyzeAllPlacements>[0]
export const fixture: Circuit = [
  { type: "pcb_board", center: { x: 0, y: 0 }, width: 12, height: 8 },
  ...[0, 3].flatMap(
    (x, index): Circuit => [
      {
        type: "source_component",
        source_component_id: `source_component_${index}`,
        name: `R${index + 1}`,
        ftype: "simple_resistor",
      },
      {
        type: "pcb_component",
        source_component_id: `source_component_${index}`,
        pcb_component_id: `pcb_component_${index}`,
        center: { x, y: 0 },
        width: 1,
        height: 1,
        layer: "top",
      },
      {
        type: "pcb_courtyard_circle",
        pcb_component_id: `pcb_component_${index}`,
        center: { x, y: 0 },
        radius: 2,
        layer: "top",
      },
    ],
  ),
]

