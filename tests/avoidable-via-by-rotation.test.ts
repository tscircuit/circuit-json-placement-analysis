import { expect, test } from "bun:test"
import { analyzeAllPlacements } from "../lib"

type CircuitElement = {
  type?: string
  [key: string]: unknown
}

const makeCrossedCapacitorCircuit = ({
  rotated = false,
  withCrossoverVias = true,
}: {
  rotated?: boolean
  withCrossoverVias?: boolean
} = {}): CircuitElement[] => {
  const pin1X = rotated ? 36.01 : 34.99
  const pin2X = rotated ? 34.99 : 36.01

  const pin2Route = withCrossoverVias
    ? [
        {
          route_type: "wire",
          x: 32.81,
          y: 10.5,
          width: 0.35,
          layer: "top",
          start_pcb_port_id: "remote_pin2",
        },
        {
          route_type: "wire",
          x: 34.213,
          y: 10.596,
          width: 0.35,
          layer: "top",
        },
        {
          route_type: "via",
          x: 34.213,
          y: 10.596,
          from_layer: "top",
          to_layer: "bottom",
          via_diameter: 0.3,
        },
        {
          route_type: "wire",
          x: 34.213,
          y: 10.596,
          width: 0.35,
          layer: "bottom",
        },
        {
          route_type: "wire",
          x: 35.3339,
          y: 10.596,
          width: 0.35,
          layer: "bottom",
        },
        {
          route_type: "wire",
          x: 35.462,
          y: 10.705,
          width: 0.35,
          layer: "bottom",
        },
        {
          route_type: "via",
          x: 35.462,
          y: 10.705,
          from_layer: "bottom",
          to_layer: "top",
          via_diameter: 0.3,
        },
        {
          route_type: "wire",
          x: 35.462,
          y: 10.705,
          width: 0.35,
          layer: "top",
        },
        {
          route_type: "wire",
          x: pin2X,
          y: 9,
          width: 0.35,
          layer: "top",
          end_pcb_port_id: "cap_pin2",
        },
      ]
    : [
        {
          route_type: "wire",
          x: 32.81,
          y: 10.5,
          width: 0.35,
          layer: "top",
          start_pcb_port_id: "remote_pin2",
        },
        {
          route_type: "wire",
          x: pin2X,
          y: 9,
          width: 0.35,
          layer: "top",
          end_pcb_port_id: "cap_pin2",
        },
      ]

  return [
    {
      type: "source_component",
      source_component_id: "source_cap",
      ftype: "simple_capacitor",
      name: "C_BIAS_PRE1",
      are_pins_interchangeable: true,
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_cap",
      source_component_id: "source_cap",
      center: { x: 35.5, y: 9 },
      width: 1.56,
      height: 0.64,
      layer: "top",
      rotation: rotated ? 180 : 0,
    },
    {
      type: "pcb_port",
      pcb_port_id: "cap_pin1",
      pcb_component_id: "pcb_cap",
      x: pin1X,
      y: 9,
      layers: ["top"],
    },
    {
      type: "pcb_port",
      pcb_port_id: "cap_pin2",
      pcb_component_id: "pcb_cap",
      x: pin2X,
      y: 9,
      layers: ["top"],
    },
    {
      type: "pcb_port",
      pcb_port_id: "remote_pin1",
      pcb_component_id: "pcb_remote_1",
      x: 34.99,
      y: 13.8,
      layers: ["top"],
    },
    {
      type: "pcb_port",
      pcb_port_id: "remote_pin2",
      pcb_component_id: "pcb_remote_2",
      x: 32.81,
      y: 10.5,
      layers: ["top"],
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "pin1_route",
      route: [
        {
          route_type: "wire",
          x: pin1X,
          y: 9,
          width: 0.35,
          layer: "top",
          start_pcb_port_id: "cap_pin1",
        },
        {
          route_type: "wire",
          x: 34.99,
          y: 13.8,
          width: 0.35,
          layer: "top",
          end_pcb_port_id: "remote_pin1",
        },
      ],
    },
    {
      type: "pcb_trace",
      pcb_trace_id: "pin2_route",
      route: pin2Route,
    },
  ]
}

test("reports the C_BIAS_PRE1 crossover as avoidable with a 180 degree rotation", () => {
  const analysis = analyzeAllPlacements(makeCrossedCapacitorCircuit())
  const issue = analysis
    .getIssues()
    .find((candidate) => candidate.type === "avoidable_via_by_rotation")

  expect(issue).toMatchObject({
    type: "avoidable_via_by_rotation",
    componentA: "C_BIAS_PRE1",
    summary: "C_BIAS_PRE1 has crossed two-pin connections using 2 vias",
    suggested_pcb_rotation_delta_degrees: 180,
    avoidable_via_count: 2,
    related_pcb_trace_ids: ["pin1_route", "pin2_route"],
  })
  expect(analysis.getString()).toContain(
    "rotate C_BIAS_PRE1 180\u00b0 to uncross its connections and potentially remove 2 vias",
  )
})

test("does not report the crossover after the capacitor is rotated", () => {
  const analysis = analyzeAllPlacements(
    makeCrossedCapacitorCircuit({ rotated: true }),
  )

  expect(
    analysis
      .getIssues()
      .some((issue) => issue.type === "avoidable_via_by_rotation"),
  ).toBe(false)
})

test("does not infer avoidable vias from unrouted crossed airwires", () => {
  const analysis = analyzeAllPlacements(
    makeCrossedCapacitorCircuit({ withCrossoverVias: false }),
  )

  expect(
    analysis
      .getIssues()
      .some((issue) => issue.type === "avoidable_via_by_rotation"),
  ).toBe(false)
})
