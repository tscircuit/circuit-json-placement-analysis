import {
  type AnyCircuitElement,
  any_circuit_element,
  type PcbCopperPour,
  type PcbTrace,
  type PcbVia,
} from "circuit-json"
import type { DdrPlacementOptions, DdrPoint } from "../../lib"
export const rectPoints = (
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
) => [
  { x: minX, y: minY },
  { x: maxX, y: minY },
  { x: maxX, y: maxY },
  { x: minX, y: maxY },
]
export const fixtureElement = (raw: object): AnyCircuitElement =>
  ({ ...raw, ...any_circuit_element.parse(raw) }) as AnyCircuitElement
export const fill = (
  id: string,
  layer: string,
  net = "gnd",
  points = rectPoints(-10, -5, 10, 5),
  holes: DdrPoint[][] = [],
): PcbCopperPour =>
  fixtureElement({
    type: "pcb_copper_pour",
    pcb_copper_pour_id: id,
    shape: "brep",
    layer,
    source_net_id: net,
    brep_shape: {
      outer_ring: { vertices: points.slice().reverse() },
      inner_rings: holes.map((vertices) => ({ vertices })),
    },
  }) as PcbCopperPour
export const via = (
  id: string,
  x: number,
  y: number,
  layers: string[],
  net = "gnd",
  traceId?: string,
): PcbVia =>
  fixtureElement({
    type: "pcb_via",
    pcb_via_id: id,
    x,
    y,
    outer_diameter: 0.6,
    hole_diameter: 0.25,
    layers,
    source_net_id: net,
    pcb_trace_id: traceId,
  }) as PcbVia
export const wires = (layer: string): PcbTrace =>
  fixtureElement({
    type: "pcb_trace",
    pcb_trace_id: "ddr_route",
    source_trace_id: "ddr_source",
    route: [
      {
        route_type: "wire",
        x: -8,
        y: 0,
        width: 0.15,
        layer,
        start_pcb_port_id: "signal_a",
      },
      {
        route_type: "wire",
        x: 8,
        y: 0,
        width: 0.15,
        layer,
        end_pcb_port_id: "signal_b",
      },
    ],
  }) as PcbTrace
export const hop = (fromLayer = "top", toLayer = "bottom"): PcbTrace =>
  fixtureElement({
    type: "pcb_trace",
    pcb_trace_id: "ddr_route",
    source_trace_id: "ddr_source",
    route: [
      {
        route_type: "wire",
        x: -8,
        y: 0,
        width: 0.15,
        layer: fromLayer,
        start_pcb_port_id: "signal_a",
      },
      { route_type: "wire", x: 0, y: 0, width: 0.15, layer: fromLayer },
      {
        route_type: "via",
        x: 0,
        y: 0,
        from_layer: fromLayer,
        to_layer: toLayer,
      },
      { route_type: "wire", x: 0, y: 0, width: 0.15, layer: toLayer },
      {
        route_type: "wire",
        x: 8,
        y: 0,
        width: 0.15,
        layer: toLayer,
        end_pcb_port_id: "signal_b",
      },
    ],
  }) as PcbTrace
export const terminal = (
  componentId: string,
  portId: string,
  x: number,
  y: number,
  layer: string,
  net: string,
): AnyCircuitElement[] => [
  fixtureElement({
    type: "source_port",
    source_port_id: portId,
    source_component_id: componentId,
    name: portId,
  }),
  fixtureElement({
    type: "pcb_port",
    pcb_port_id: portId,
    source_port_id: portId,
    x,
    y,
    layers: [layer],
  }),
  fixtureElement({
    type: "pcb_smtpad",
    pcb_smtpad_id: `pad_${portId}`,
    pcb_port_id: portId,
    shape: "circle",
    x,
    y,
    radius: 0.3,
    layer,
  }),
  fixtureElement({
    type: "source_trace",
    source_trace_id: `source_${portId}`,
    connected_source_port_ids: [portId],
    connected_source_net_ids: [net],
  }),
]
export const ddrFixture = () => {
  const elements: AnyCircuitElement[] = [
    fixtureElement({
      type: "pcb_board",
      pcb_board_id: "board",
      center: { x: 0, y: 0 },
      width: 20,
      height: 10,
      num_layers: 6,
    }),
    fixtureElement({
      type: "source_component",
      source_component_id: "controller",
      name: "U1",
      ftype: "simple_chip",
    }),
    fixtureElement({
      type: "source_component",
      source_component_id: "memory",
      name: "U2",
      ftype: "simple_chip",
    }),
    fixtureElement({
      type: "source_net",
      source_net_id: "ddr",
      name: "DDR_D0",
      member_source_group_ids: [],
      is_digital_signal: true,
    }),
    fixtureElement({
      type: "source_net",
      source_net_id: "gnd",
      name: "GND",
      member_source_group_ids: [],
      is_ground: true,
    }),
    fixtureElement({
      type: "source_net",
      source_net_id: "power",
      name: "VDDS_DDR",
      member_source_group_ids: [],
      is_power: true,
    }),
    ...terminal("controller", "signal_a", -8, 0, "top", "ddr"),
    ...terminal("memory", "signal_b", 8, 0, "bottom", "ddr"),
    ...terminal("controller", "ground_a", -8, 1, "top", "gnd"),
    ...terminal("memory", "ground_b", 8, 1, "bottom", "gnd"),
    fixtureElement({
      type: "source_trace",
      source_trace_id: "ddr_source",
      connected_source_port_ids: ["signal_a", "signal_b"],
      connected_source_net_ids: ["ddr"],
    }),
    fill("ground_inner1", "inner1", "gnd", rectPoints(-10, -5, 10, 5), [
      rectPoints(-0.2, -0.2, 0.2, 0.2),
    ]),
    fill("ground_inner4", "inner4", "gnd", rectPoints(-10, -5, 10, 5), [
      rectPoints(-0.2, -0.2, 0.2, 0.2),
    ]),
    hop(),
    via(
      "signal_via",
      0,
      0,
      ["top", "inner1", "inner2", "inner3", "inner4", "bottom"],
      "ddr",
      "ddr_route",
    ),
    via("anchor_a", -8, 1, ["top", "inner1"], "gnd"),
    via("anchor_b", 8, 1, ["inner4", "bottom"], "gnd"),
    via(
      "existing_return",
      0,
      0.7,
      ["top", "inner1", "inner2", "inner3", "inner4", "bottom"],
      "gnd",
    ),
  ]
  const options: DdrPlacementOptions = {
    groups: [
      {
        name: "DQ",
        sourceNetIds: ["ddr"],
        provenance: "Generic declared DDR data group",
      },
    ],
    stackup: {
      provenance: {
        kind: "declared",
        source: "Generic six-layer design metadata",
      },
      copperLayers: ["top", "inner1", "inner2", "inner3", "inner4", "bottom"],
      references: [
        {
          signalLayer: "top",
          referenceLayer: "inner1",
          sourceNetId: "gnd",
          dielectricHeightMm: 0.1,
        },
        {
          signalLayer: "bottom",
          referenceLayer: "inner4",
          sourceNetId: "gnd",
          dielectricHeightMm: 0.1,
        },
      ],
    },
    filledCopper: {
      pcbCopperPourIds: ["ground_inner1", "ground_inner4"],
      provenance: "Generic final fill fixture with explicit holes",
    },
    signalViaAntipads: ["ground_inner1", "ground_inner4"].map(
      (pcbCopperPourId) => ({
        pcbViaId: "signal_via",
        pcbCopperPourId,
        innerRingIndex: 0,
        maxRadiusMm: 0.3,
        provenance: "Generic final solved isolated via clearance",
      }),
    ),
    policy: {
      name: "generic_reviewed",
      provenance: "Synthetic test policy, not manufacturer signoff",
      preferGround: true,
      maxReturnViaDistanceMm: 1,
      coverageMarginHeightFactor: 3,
      minCopperClearanceMm: 0.2,
    },
  }
  return {
    elements: elements.filter(
      (e) =>
        e.type !== "source_trace" ||
        !["source_signal_a", "source_signal_b"].includes(e.source_trace_id),
    ),
    options,
  }
}
export const replaceElement = (
  elements: AnyCircuitElement[],
  id: string,
  replacement: AnyCircuitElement,
) =>
  elements.map((e) =>
    Object.values(e).includes(id) && e.type === replacement.type
      ? replacement
      : e,
  )
