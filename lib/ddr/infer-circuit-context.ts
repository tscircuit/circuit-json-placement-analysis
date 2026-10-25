import type { AnyCircuitElement } from "circuit-json"
import { elementsOfType, SourceConnectivity } from "./model"
import type { DdrGroup, DdrPolicy, DdrReference, DdrStackup } from "./types"

/** Advisory screening choices, not board facts or manufacturer/SI limits. */
export const SCREENING_POLICY: DdrPolicy = {
  name: "advisory_signal_reference_v1",
  provenance:
    "Internal advisory screening; 1 mm is not a universal electrical limit",
  preferGround: true,
  requireAdjacentReference: true,
  maxReturnViaDistanceMm: 1,
}
export const ISOLATED_ANTIPAD_RADIUS_MM = 0.5

/** Derive board-world mm geometry candidates from Circuit JSON. No names establish protocol or roles. */
export const inferCircuitContext = (
  circuitJson: readonly AnyCircuitElement[],
) => {
  const connectivity = new SourceConnectivity(circuitJson)
  const nets = elementsOfType(circuitJson, "source_net")
  const sources = elementsOfType(circuitJson, "source_trace")
  const traces = elementsOfType(circuitJson, "pcb_trace")
  const sourceTraceIds = sources
    .filter((source) => {
      if (
        !traces.some(
          (trace) => trace.source_trace_id === source.source_trace_id,
        )
      )
        return false
      const net = nets.find(
        (n) => n.source_net_id === connectivity.traceNet(source),
      )
      return !net?.is_ground && !net?.is_power
    })
    .map((source) => source.source_trace_id)
  const groups: DdrGroup[] = sourceTraceIds.length
    ? [
        {
          name: "Signal candidates",
          sourceTraceIds,
          provenance:
            "Rendered routed source connections excluding declared ground/power; DDR protocol is unknown",
        },
      ]
    : []
  const pours = elementsOfType(circuitJson, "pcb_copper_pour")
  const filledCopper = pours.length
    ? {
        pcbCopperPourIds: pours.map((p) => p.pcb_copper_pour_id),
        provenance:
          "ASSUMED exported pour geometry represents final filled copper, including all clearances",
      }
    : undefined
  const assumptions = [
    "DDR membership is unknown; these are signal candidates, not identified DDR nets.",
    "Exported copper-pour geometry is assumed to include the final solved fill and clearances.",
    "Ground preference, 1 mm return-distance screening and 0.5 mm isolated-clearance radius are advisory analyzer policy, not hardware or SI facts.",
  ]
  const boards = elementsOfType(circuitJson, "pcb_board").filter(
    (b) => !b.is_subcircuit,
  )
  const count = boards.length === 1 ? boards[0]!.num_layers : undefined
  const copperLayers =
    count !== undefined && Number.isInteger(count) && count >= 2 && count <= 10
      ? [
          "top",
          ...Array.from({ length: count - 2 }, (_, i) => `inner${i + 1}`),
          "bottom",
        ]
      : undefined
  const usedLayers = [
    ...pours.map((p) => p.layer),
    ...traces.flatMap((trace) =>
      trace.route.flatMap((p) =>
        p.route_type === "wire"
          ? [p.layer]
          : p.route_type === "via"
            ? [p.from_layer, p.to_layer]
            : [],
      ),
    ),
    ...elementsOfType(circuitJson, "pcb_via").flatMap((via) => via.layers),
  ]
  const references: DdrReference[] = []
  const ambiguousReferences: {
    signalLayer: string
    referenceLayer: string
    sourceNetIds: string[]
  }[] = []
  let stackup: DdrStackup | undefined
  if (
    copperLayers &&
    usedLayers.every((layer) => copperLayers.includes(layer))
  ) {
    for (const [i, signalLayer] of copperLayers.entries()) {
      for (const referenceLayer of [copperLayers[i - 1], copperLayers[i + 1]]) {
        if (!referenceLayer) continue
        const candidates = nets.filter(
          (net) =>
            net.is_ground !== net.is_power &&
            (net.is_ground || net.is_power) &&
            pours.some(
              (p) =>
                p.layer === referenceLayer &&
                p.source_net_id === net.source_net_id,
            ),
        )
        // Prefer actual flagged ground; a distant power pour on the same layer is not another required reference.
        const ground = candidates.filter((net) => net.is_ground)
        const selected = ground.length ? ground : candidates
        if (selected.length === 1)
          references.push({
            signalLayer,
            referenceLayer,
            sourceNetId: selected[0]!.source_net_id,
          })
        else if (selected.length > 1)
          ambiguousReferences.push({
            signalLayer,
            referenceLayer,
            sourceNetIds: selected.map((n) => n.source_net_id),
          })
      }
    }
    stackup = {
      provenance: {
        kind: "assumed",
        source: `Conventional ${count}-layer order; adjacent copper with declared ground/power roles is a reference candidate`,
      },
      copperLayers,
      references,
    }
    assumptions.push(
      "Layer order and electrical reference choice are assumed; no dielectric spacing or permittivity is inferred from material.",
    )
  }
  return {
    groups,
    stackup,
    filledCopper,
    assumptions,
    ambiguousReferences,
    unmappedTraces: traces.filter(
      (trace) =>
        !sources.some(
          (source) => source.source_trace_id === trace.source_trace_id,
        ),
    ),
  }
}
