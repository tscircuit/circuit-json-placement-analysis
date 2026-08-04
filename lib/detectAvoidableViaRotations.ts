import type { LayerRef } from "circuit-json"
import type { PlacementIssue } from "./types"

type CircuitElement = {
  type?: string
  [key: string]: unknown
}

type Point = {
  x: number
  y: number
}

type PcbPortContext = Point & {
  id: string
  pcbComponentId: string
  layers: LayerRef[]
}

type TraceEndpoint = Point & {
  portId: string
  layers: LayerRef[]
}

type RoutedConnection = {
  traceId: string
  otherEndpoint: TraceEndpoint
  route: CircuitElement[]
}

type RotationCandidate = {
  currentDirectDistance: number
  rotatedDirectDistance: number
  traceIds: [string, string]
  viaCount: number
}

const GEOMETRY_EPSILON = 1e-6
const MAX_PORT_SYMMETRY_ERROR_MM = 0.05
const MIN_DIRECT_DISTANCE_IMPROVEMENT_MM = 0.1

const toNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

const getLayers = (value: unknown): LayerRef[] =>
  Array.isArray(value)
    ? value.filter((layer): layer is LayerRef => typeof layer === "string")
    : []

const getPoint = (value: unknown): Point | null => {
  if (typeof value !== "object" || value === null) return null
  const point = value as { x?: unknown; y?: unknown }
  const x = toNumber(point.x)
  const y = toNumber(point.y)
  return x === null || y === null ? null : { x, y }
}

const getDistance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

const pointsAreEqual = (a: Point, b: Point): boolean =>
  getDistance(a, b) <= GEOMETRY_EPSILON

const layersIntersect = (a: LayerRef[], b: LayerRef[]): boolean => {
  const bSet = new Set(b)
  return a.some((layer) => bSet.has(layer))
}

const getOrientation = (a: Point, b: Point, c: Point): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

/**
 * Returns true only for an interior crossing. Touching or collinear fanout
 * segments do not establish that a layer change could be removed.
 */
const segmentsProperlyIntersect = (
  aStart: Point,
  aEnd: Point,
  bStart: Point,
  bEnd: Point,
): boolean => {
  const aSide1 = getOrientation(aStart, aEnd, bStart)
  const aSide2 = getOrientation(aStart, aEnd, bEnd)
  const bSide1 = getOrientation(bStart, bEnd, aStart)
  const bSide2 = getOrientation(bStart, bEnd, aEnd)

  return (
    aSide1 * aSide2 < -GEOMETRY_EPSILON && bSide1 * bSide2 < -GEOMETRY_EPSILON
  )
}

const getRouteEndpointLayers = (
  route: CircuitElement[],
  routeIndex: number,
): LayerRef[] => {
  const endpoint = route[routeIndex]
  const endpointLayer =
    typeof endpoint?.layer === "string" ? ([endpoint.layer] as LayerRef[]) : []
  if (endpointLayer.length > 0) return endpointLayer

  const step = routeIndex === 0 ? 1 : -1
  for (
    let index = routeIndex + step;
    index >= 0 && index < route.length;
    index += step
  ) {
    const layer = route[index]?.layer
    if (typeof layer === "string") return [layer as LayerRef]
  }

  return []
}

const getTraceEndpoints = (
  route: CircuitElement[],
  portsById: Map<string, PcbPortContext>,
): TraceEndpoint[] => {
  const endpointByPortId = new Map<string, TraceEndpoint>()

  route.forEach((routePoint, routeIndex) => {
    for (const key of ["start_pcb_port_id", "end_pcb_port_id"] as const) {
      const portId = routePoint[key]
      if (typeof portId !== "string" || endpointByPortId.has(portId)) continue

      const knownPort = portsById.get(portId)
      const routePointPosition = getPoint(routePoint)
      const position = knownPort ?? routePointPosition
      if (!position) continue

      endpointByPortId.set(portId, {
        portId,
        x: position.x,
        y: position.y,
        layers: knownPort?.layers ?? getRouteEndpointLayers(route, routeIndex),
      })
    }
  })

  return [...endpointByPortId.values()]
}

const getPcbPorts = (
  circuitJson: CircuitElement[],
): {
  portsByComponentId: Map<string, PcbPortContext[]>
  portsById: Map<string, PcbPortContext>
} => {
  const portsByComponentId = new Map<string, PcbPortContext[]>()
  const portsById = new Map<string, PcbPortContext>()

  for (const element of circuitJson) {
    if (
      element.type !== "pcb_port" ||
      typeof element.pcb_port_id !== "string" ||
      typeof element.pcb_component_id !== "string"
    ) {
      continue
    }

    const x = toNumber(element.x)
    const y = toNumber(element.y)
    if (x === null || y === null) continue

    const port: PcbPortContext = {
      id: element.pcb_port_id,
      pcbComponentId: element.pcb_component_id,
      x,
      y,
      layers: getLayers(element.layers),
    }

    portsById.set(port.id, port)
    const componentPorts = portsByComponentId.get(port.pcbComponentId) ?? []
    componentPorts.push(port)
    portsByComponentId.set(port.pcbComponentId, componentPorts)
  }

  return { portsByComponentId, portsById }
}

const getConnectionsByPortId = (
  circuitJson: CircuitElement[],
  portsById: Map<string, PcbPortContext>,
): Map<string, RoutedConnection[]> => {
  const connectionsByPortId = new Map<string, RoutedConnection[]>()

  for (const element of circuitJson) {
    if (
      element.type !== "pcb_trace" ||
      typeof element.pcb_trace_id !== "string"
    ) {
      continue
    }

    const route = Array.isArray(element.route)
      ? (element.route as CircuitElement[])
      : []
    const endpoints = getTraceEndpoints(route, portsById)
    if (endpoints.length !== 2) continue

    const [first, second] = endpoints
    if (!first || !second || first.portId === second.portId) continue

    for (const [endpoint, otherEndpoint] of [
      [first, second],
      [second, first],
    ] as const) {
      const connections = connectionsByPortId.get(endpoint.portId) ?? []
      connections.push({
        traceId: element.pcb_trace_id,
        otherEndpoint,
        route,
      })
      connectionsByPortId.set(endpoint.portId, connections)
    }
  }

  return connectionsByPortId
}

type LayeredSegment = {
  start: Point
  end: Point
  layer: LayerRef
}

const getWireSegments = (
  route: CircuitElement[],
  startIndex = 0,
  endIndex = route.length - 1,
): LayeredSegment[] => {
  const segments: LayeredSegment[] = []

  for (let index = startIndex; index < endIndex; index += 1) {
    const startElement = route[index]
    const endElement = route[index + 1]
    const start = getPoint(startElement)
    const end = getPoint(endElement)
    if (!start || !end || pointsAreEqual(start, end)) continue

    const layer =
      typeof startElement?.layer === "string"
        ? startElement.layer
        : typeof endElement?.layer === "string"
          ? endElement.layer
          : null
    if (!layer) continue

    segments.push({ start, end, layer: layer as LayerRef })
  }

  return segments
}

const getSharedLayers = (a: LayerRef[], b: LayerRef[]): LayerRef[] => {
  const bSet = new Set(b)
  return a.filter((layer) => bSet.has(layer))
}

/**
 * Finds via pairs that carry one connection across the other connection on a
 * different layer. This routed XY crossover is the concrete evidence that the
 * vias are serving the fanout inversion rather than an unrelated route need.
 */
const getCrossoverViaIndices = (
  bridgeRoute: CircuitElement[],
  otherRoute: CircuitElement[],
  sharedRoutingLayers: LayerRef[],
): Set<number> => {
  const avoidableViaIndices = new Set<number>()
  const viaIndices = bridgeRoute
    .map((routePoint, index) =>
      routePoint.route_type === "via" ? index : null,
    )
    .filter((index): index is number => index !== null)

  for (let pairIndex = 0; pairIndex < viaIndices.length - 1; pairIndex += 1) {
    const firstViaIndex = viaIndices[pairIndex]!
    const secondViaIndex = viaIndices[pairIndex + 1]!
    const firstVia = bridgeRoute[firstViaIndex]!
    const secondVia = bridgeRoute[secondViaIndex]!
    const firstViaLayers = getLayers([firstVia.from_layer, firstVia.to_layer])
    const secondViaLayers = getLayers([
      secondVia.from_layer,
      secondVia.to_layer,
    ])
    const bridgeSegments = getWireSegments(
      bridgeRoute,
      firstViaIndex,
      secondViaIndex,
    )

    for (const routingLayer of sharedRoutingLayers) {
      if (
        !firstViaLayers.includes(routingLayer) ||
        !secondViaLayers.includes(routingLayer)
      ) {
        continue
      }

      const offLayerBridgeSegments = bridgeSegments.filter(
        (segment) => segment.layer !== routingLayer,
      )
      const otherRoutingSegments = getWireSegments(otherRoute).filter(
        (segment) => segment.layer === routingLayer,
      )
      const crossesOtherRoute = offLayerBridgeSegments.some((bridgeSegment) =>
        otherRoutingSegments.some((otherSegment) =>
          segmentsProperlyIntersect(
            bridgeSegment.start,
            bridgeSegment.end,
            otherSegment.start,
            otherSegment.end,
          ),
        ),
      )

      if (crossesOtherRoute) {
        avoidableViaIndices.add(firstViaIndex)
        avoidableViaIndices.add(secondViaIndex)
      }
    }
  }

  return avoidableViaIndices
}

const getCrossoverViaCount = (
  firstPort: PcbPortContext,
  firstConnection: RoutedConnection,
  secondPort: PcbPortContext,
  secondConnection: RoutedConnection,
): number => {
  const firstConnectionLayers = getSharedLayers(
    firstPort.layers,
    firstConnection.otherEndpoint.layers,
  )
  const secondConnectionLayers = getSharedLayers(
    secondPort.layers,
    secondConnection.otherEndpoint.layers,
  )
  const commonRoutingLayers = getSharedLayers(
    firstConnectionLayers,
    secondConnectionLayers,
  )
  if (commonRoutingLayers.length === 0) return 0

  return (
    getCrossoverViaIndices(
      firstConnection.route,
      secondConnection.route,
      commonRoutingLayers,
    ).size +
    getCrossoverViaIndices(
      secondConnection.route,
      firstConnection.route,
      commonRoutingLayers,
    ).size
  )
}

const portsAreSymmetricAroundCenter = (
  first: PcbPortContext,
  second: PcbPortContext,
  center: Point,
): boolean => {
  const reflectedFirst = {
    x: center.x * 2 - first.x,
    y: center.y * 2 - first.y,
  }
  const reflectedSecond = {
    x: center.x * 2 - second.x,
    y: center.y * 2 - second.y,
  }

  return (
    getDistance(reflectedFirst, second) <= MAX_PORT_SYMMETRY_ERROR_MM &&
    getDistance(reflectedSecond, first) <= MAX_PORT_SYMMETRY_ERROR_MM
  )
}

const getBestRotationCandidate = (
  firstPort: PcbPortContext,
  secondPort: PcbPortContext,
  connectionsByPortId: Map<string, RoutedConnection[]>,
): RotationCandidate | null => {
  const candidates: RotationCandidate[] = []

  for (const firstConnection of connectionsByPortId.get(firstPort.id) ?? []) {
    for (const secondConnection of connectionsByPortId.get(secondPort.id) ??
      []) {
      if (firstConnection.traceId === secondConnection.traceId) continue
      if (
        pointsAreEqual(
          firstConnection.otherEndpoint,
          secondConnection.otherEndpoint,
        )
      ) {
        continue
      }

      const viaCount = getCrossoverViaCount(
        firstPort,
        firstConnection,
        secondPort,
        secondConnection,
      )
      if (viaCount === 0) continue

      // A shared endpoint layer is required for both connections. Otherwise a
      // layer transition may be electrically necessary regardless of rotation.
      if (
        !layersIntersect(
          firstPort.layers,
          firstConnection.otherEndpoint.layers,
        ) ||
        !layersIntersect(
          secondPort.layers,
          secondConnection.otherEndpoint.layers,
        )
      ) {
        continue
      }

      const connectionsCurrentlyCross = segmentsProperlyIntersect(
        firstPort,
        firstConnection.otherEndpoint,
        secondPort,
        secondConnection.otherEndpoint,
      )
      const connectionsCrossAfterRotation = segmentsProperlyIntersect(
        secondPort,
        firstConnection.otherEndpoint,
        firstPort,
        secondConnection.otherEndpoint,
      )
      if (!connectionsCurrentlyCross || connectionsCrossAfterRotation) continue

      const currentDirectDistance =
        getDistance(firstPort, firstConnection.otherEndpoint) +
        getDistance(secondPort, secondConnection.otherEndpoint)
      const rotatedDirectDistance =
        getDistance(secondPort, firstConnection.otherEndpoint) +
        getDistance(firstPort, secondConnection.otherEndpoint)

      if (
        currentDirectDistance - rotatedDirectDistance <
        MIN_DIRECT_DISTANCE_IMPROVEMENT_MM
      ) {
        continue
      }

      candidates.push({
        currentDirectDistance,
        rotatedDirectDistance,
        traceIds: [firstConnection.traceId, secondConnection.traceId],
        viaCount,
      })
    }
  }

  return (
    candidates.sort((a, b) => {
      if (b.viaCount !== a.viaCount) return b.viaCount - a.viaCount
      const improvementA = a.currentDirectDistance - a.rotatedDirectDistance
      const improvementB = b.currentDirectDistance - b.rotatedDirectDistance
      if (improvementB !== improvementA) return improvementB - improvementA
      return a.traceIds.join("\0").localeCompare(b.traceIds.join("\0"))
    })[0] ?? null
  )
}

export const detectAvoidableViaRotations = (
  circuitJson: CircuitElement[],
): PlacementIssue[] => {
  const sourceComponentsById = new Map<string, CircuitElement>()
  const sourceComponentNamesById = new Map<string, string>()

  for (const element of circuitJson) {
    if (
      element.type !== "source_component" ||
      typeof element.source_component_id !== "string" ||
      typeof element.name !== "string"
    ) {
      continue
    }
    sourceComponentsById.set(element.source_component_id, element)
    sourceComponentNamesById.set(element.source_component_id, element.name)
  }

  const { portsByComponentId, portsById } = getPcbPorts(circuitJson)
  const connectionsByPortId = getConnectionsByPortId(circuitJson, portsById)
  const issues: PlacementIssue[] = []

  for (const element of circuitJson) {
    if (
      element.type !== "pcb_component" ||
      typeof element.pcb_component_id !== "string" ||
      typeof element.source_component_id !== "string"
    ) {
      continue
    }

    const sourceComponent = sourceComponentsById.get(
      element.source_component_id,
    )
    const componentName = sourceComponentNamesById.get(
      element.source_component_id,
    )
    const center = getPoint(element.center)
    const ports = portsByComponentId.get(element.pcb_component_id) ?? []

    // Interchangeable, symmetric two-pin parts are the high-confidence case:
    // their 180-degree rotation swaps the two fanout origins without changing
    // the component envelope or electrical behavior.
    if (
      sourceComponent?.are_pins_interchangeable !== true ||
      !componentName ||
      !center ||
      ports.length !== 2 ||
      !portsAreSymmetricAroundCenter(ports[0]!, ports[1]!, center)
    ) {
      continue
    }

    const candidate = getBestRotationCandidate(
      ports[0]!,
      ports[1]!,
      connectionsByPortId,
    )
    if (!candidate) continue

    const viaLabel = `${candidate.viaCount} via${candidate.viaCount === 1 ? "" : "s"}`
    issues.push({
      type: "avoidable_via_by_rotation",
      componentA: componentName,
      clearance: 0,
      severity:
        80 +
        candidate.viaCount * 10 +
        (candidate.currentDirectDistance - candidate.rotatedDirectDistance) * 5,
      summary: `${componentName} has crossed two-pin connections using ${viaLabel}`,
      suggested_pcb_rotation_delta_degrees: 180,
      avoidable_via_count: candidate.viaCount,
      related_pcb_trace_ids: candidate.traceIds,
    })
  }

  return issues.sort((a, b) => b.severity - a.severity)
}
