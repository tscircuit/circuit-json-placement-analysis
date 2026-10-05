import type {
  AnyCircuitElement,
  PcbCopperPour,
  PcbPort,
  PcbTrace,
  PcbVia,
  SourcePort,
  SourceTrace,
} from "circuit-json"
import {
  annulusContact,
  type CopperGeometry,
  disk,
  distance,
  hasContact,
  padGeometry,
  pourGeometry,
  traceStrip,
  union,
} from "./geometry"
import type { DdrPoint, DdrStackup, SourceNetId } from "./types"

export interface DdrSegment {
  start: DdrPoint
  end: DdrPoint
  layer: string
  width: number
  index: number
}
export interface DdrTransition {
  point: DdrPoint
  fromLayer: string
  toLayer: string
  index: number
}
export const routeGeometry = (trace: PcbTrace) => {
  const segments: DdrSegment[] = []
  const transitions: DdrTransition[] = []
  const unsupported: string[] = []
  const route = trace.route
  for (let i = 0; i < route.length; i++) {
    const p = route[i]!
    if (p.route_type === "through_pad") {
      unsupported.push(`route[${i}] through_pad is unsupported`)
      continue
    }
    if (
      ![p.x, p.y].every(Number.isFinite) ||
      (p.route_type === "wire" && (!Number.isFinite(p.width) || p.width <= 0))
    ) {
      unsupported.push(`route[${i}] has invalid geometry`)
      continue
    }
    if (p.route_type === "via")
      transitions.push({
        point: { x: p.x, y: p.y },
        fromLayer: p.from_layer,
        toLayer: p.to_layer,
        index: i,
      })
    const q = route[i + 1]
    if (!q || q.route_type === "through_pad") continue
    if (
      ![q.x, q.y].every(Number.isFinite) ||
      (q.route_type === "wire" && (!Number.isFinite(q.width) || q.width <= 0))
    )
      continue
    const startLayer = p.route_type === "wire" ? p.layer : p.to_layer
    const endLayer = q.route_type === "wire" ? q.layer : q.from_layer
    if (startLayer !== endLayer) {
      unsupported.push(`route[${i}..${i + 1}] changes layer without a via`)
      continue
    }
    if (distance(p, q) < 1e-8) continue
    const width = Math.max(
      p.route_type === "wire" ? p.width : 0,
      q.route_type === "wire" ? q.width : 0,
    )
    if (width <= 0) {
      unsupported.push(`route[${i}..${i + 1}] has no declared wire width`)
      continue
    }
    segments.push({
      start: { x: p.x, y: p.y },
      end: { x: q.x, y: q.y },
      layer: startLayer,
      width: Math.max(
        p.route_type === "wire" ? p.width : 0,
        q.route_type === "wire" ? q.width : 0,
      ),
      index: i,
    })
  }
  return { segments, transitions, unsupported }
}
class Connectivity {
  private parents = new Map<string, string>()
  find(id: string): string {
    const parent = this.parents.get(id)
    if (!parent) {
      this.parents.set(id, id)
      return id
    }
    if (parent === id) return id
    const root = this.find(parent)
    this.parents.set(id, root)
    return root
  }
  join(a: string, b: string) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parents.set(rb, ra)
  }
}
export class SourceConnectivity {
  private connectivity = new Connectivity()
  private sourceNets: { source_net_id: string }[]
  constructor(circuitJson: readonly AnyCircuitElement[]) {
    this.sourceNets = circuitJson.filter(
      (e): e is Extract<AnyCircuitElement, { type: "source_net" }> =>
        e.type === "source_net",
    )
    for (const trace of circuitJson.filter(
      (e): e is Extract<AnyCircuitElement, { type: "source_trace" }> =>
        e.type === "source_trace",
    )) {
      const ids = [
        `trace:${trace.source_trace_id}`,
        ...trace.connected_source_port_ids.map((id) => `port:${id}`),
        ...trace.connected_source_net_ids.map((id) => `net:${id}`),
      ]
      for (const id of ids.slice(1)) this.connectivity.join(ids[0]!, id)
    }
  }
  private netFor(id: string): SourceNetId | undefined {
    const root = this.connectivity.find(id)
    const nets = this.sourceNets.filter(
      (net) => this.connectivity.find(`net:${net.source_net_id}`) === root,
    )
    return nets.length === 1 ? nets[0]!.source_net_id : undefined
  }
  traceNet(trace: SourceTrace) {
    return this.netFor(`trace:${trace.source_trace_id}`)
  }
  portNet(port: SourcePort) {
    return this.netFor(`port:${port.source_port_id}`)
  }
}
export interface Plane {
  layer: string
  net: SourceNetId
  geometry: CopperGeometry
  pours: PcbCopperPour[]
}
interface Conductor {
  id: string
  layer: string
  net: SourceNetId
  geometry: CopperGeometry
  plane?: Plane
  terminal?: { pcbPort: PcbPort; sourcePort: SourcePort }
}
export interface ViaContact {
  via: PcbVia
  layers?: string[]
  conductors: Conductor[]
  reason?: string
}
/** Physical span only: complete consecutive layers, explicit drill bounds, or explicit through_hole. Logical trace-via from/to alone never proves barrel span. */
export const viaSpan = (
  via: PcbVia,
  stackup: DdrStackup,
): string[] | undefined => {
  const physical = via as PcbVia & {
    topmost_drill_layer?: string
    bottommost_drill_layer?: string
    through_hole?: boolean
  }
  const stack = stackup.copperLayers
  const declared =
    physical.topmost_drill_layer && physical.bottommost_drill_layer
      ? [physical.topmost_drill_layer, physical.bottommost_drill_layer]
      : physical.through_hole
        ? [stack[0]!, stack[stack.length - 1]!]
        : undefined
  if (declared) {
    const from = stack.indexOf(declared[0]!)
    const to = stack.indexOf(declared[1]!)
    if (
      from < 0 ||
      to < from ||
      via.layers.some((layer) => {
        const i = stack.indexOf(layer)
        return i < from || i > to
      })
    )
      return
    return stack.slice(from, to + 1)
  }
  const indices = [
    ...new Set(via.layers.map((layer) => stack.indexOf(layer))),
  ].sort((a, b) => a - b)
  if (
    !indices.length ||
    indices[0]! < 0 ||
    indices.some((i, j) => j > 0 && i !== indices[j - 1]! + 1)
  )
    return
  return indices.map((i) => stack[i]!)
}
export class ReferenceCopperModel {
  readonly planes: Plane[] = []
  readonly unsupported: string[] = []
  readonly vias: ViaContact[] = []
  readonly shorts: { a: Plane; b: Plane }[] = []
  private conductors: Conductor[] = []
  private connectivity = new Connectivity()
  constructor(
    circuitJson: readonly AnyCircuitElement[],
    filledPourIds: string[],
    stackup: DdrStackup,
    sourceConnectivity: SourceConnectivity,
  ) {
    const pours = circuitJson.filter(
      (e): e is Extract<AnyCircuitElement, { type: "pcb_copper_pour" }> =>
        e.type === "pcb_copper_pour" &&
        filledPourIds.includes(e.pcb_copper_pour_id),
    )
    for (const pourId of filledPourIds)
      if (!pours.some((p) => p.pcb_copper_pour_id === pourId))
        this.unsupported.push(`${pourId}: filled copper ID missing`)
    for (const pour of pours) {
      if (!pour.source_net_id) {
        this.unsupported.push(
          `${pour.pcb_copper_pour_id}: reference net unknown`,
        )
        continue
      }
      let geometry: CopperGeometry | undefined
      try {
        geometry = pourGeometry(pour)
        if (geometry) geometry = union([geometry])
      } catch {
        geometry = undefined
      }
      if (!geometry) {
        this.unsupported.push(
          `${pour.pcb_copper_pour_id}: unsupported/invalid fill (including curved bulges)`,
        )
        continue
      }
      const existing = this.planes.find(
        (p) => p.layer === pour.layer && p.net === pour.source_net_id,
      )
      if (existing) {
        existing.geometry = union([existing.geometry, geometry])
        existing.pours.push(pour)
      } else
        this.planes.push({
          layer: pour.layer,
          net: pour.source_net_id,
          geometry,
          pours: [pour],
        })
    }
    this.planes.sort((a, b) =>
      `${a.layer}:${a.net}`.localeCompare(`${b.layer}:${b.net}`),
    )
    for (const plane of this.planes)
      for (const [i, poly] of plane.geometry.entries())
        this.conductors.push({
          id: `plane:${plane.layer}:${plane.net}:${i}`,
          layer: plane.layer,
          net: plane.net,
          geometry: [poly],
          plane,
        })
    for (let i = 0; i < this.planes.length; i++)
      for (const b of this.planes.slice(i + 1)) {
        const a = this.planes[i]!
        if (
          a.layer === b.layer &&
          a.net !== b.net &&
          hasContact(a.geometry, b.geometry)
        )
          this.shorts.push({ a, b })
      }
    const sourcePorts = circuitJson.filter(
      (e): e is Extract<AnyCircuitElement, { type: "source_port" }> =>
        e.type === "source_port",
    )
    const pcbPorts = circuitJson.filter(
      (e): e is Extract<AnyCircuitElement, { type: "pcb_port" }> =>
        e.type === "pcb_port",
    )
    const nets = new Set(this.planes.map((p) => p.net))
    for (const pad of circuitJson.filter(
      (e): e is Extract<AnyCircuitElement, { type: "pcb_smtpad" }> =>
        e.type === "pcb_smtpad",
    )) {
      const pcbPort = pcbPorts.find((p) => p.pcb_port_id === pad.pcb_port_id)
      const sourcePort = sourcePorts.find(
        (p) => p.source_port_id === pcbPort?.source_port_id,
      )
      if (!pcbPort || !sourcePort) continue
      const net = sourceConnectivity.portNet(sourcePort)
      if (!net || !nets.has(net)) continue
      const geometry = padGeometry(pad)
      if (!geometry) {
        this.unsupported.push(
          `${pad.pcb_smtpad_id}: unsupported reference terminal pad`,
        )
        continue
      }
      this.conductors.push({
        id: pad.pcb_smtpad_id,
        layer: pad.layer,
        net,
        geometry,
        terminal: { pcbPort, sourcePort },
      })
    }
    for (const trace of circuitJson.filter(
      (e): e is Extract<AnyCircuitElement, { type: "pcb_trace" }> =>
        e.type === "pcb_trace",
    )) {
      const sourceTrace = circuitJson.find(
        (e) =>
          e.type === "source_trace" &&
          e.source_trace_id === trace.source_trace_id,
      )
      if (!sourceTrace || sourceTrace.type !== "source_trace") continue
      const net = sourceConnectivity.traceNet(sourceTrace)
      if (!net || !nets.has(net)) continue
      const routes = routeGeometry(trace)
      this.unsupported.push(
        ...routes.unsupported.map((s) => `${trace.pcb_trace_id}: ${s}`),
      )
      for (const segment of routes.segments)
        this.conductors.push({
          id: `${trace.pcb_trace_id}:${segment.index}`,
          layer: segment.layer,
          net,
          geometry: union([
            traceStrip(segment.start, segment.end, segment.width / 2),
            disk(segment.start, segment.width / 2),
            disk(segment.end, segment.width / 2),
          ]),
        })
      // In-route vias need a pcb_via with physical span to establish a connection.
      for (const transition of routes.transitions)
        if (
          !circuitJson.some(
            (e) =>
              e.type === "pcb_via" &&
              distance(e, transition.point) < 1e-8 &&
              (e.pcb_trace_id === trace.pcb_trace_id ||
                e.source_trace_id === trace.source_trace_id),
          )
        )
          this.unsupported.push(
            `${trace.pcb_trace_id}: reference route via lacks physical pcb_via record`,
          )
    }
    for (let i = 0; i < this.conductors.length; i++)
      for (const b of this.conductors.slice(i + 1)) {
        const a = this.conductors[i]!
        if (
          a.layer === b.layer &&
          a.net === b.net &&
          hasContact(a.geometry, b.geometry)
        )
          this.connectivity.join(a.id, b.id)
      }
    for (const via of circuitJson.filter(
      (e): e is Extract<AnyCircuitElement, { type: "pcb_via" }> =>
        e.type === "pcb_via",
    )) {
      const ownershipNets: (SourceNetId | undefined)[] = []
      const directNet = (via as PcbVia & { source_net_id?: string })
        .source_net_id
      if (directNet !== undefined) ownershipNets.push(directNet)
      if (via.source_trace_id) {
        const trace = circuitJson.find(
          (e) =>
            e.type === "source_trace" &&
            e.source_trace_id === via.source_trace_id,
        )
        ownershipNets.push(
          trace?.type === "source_trace"
            ? sourceConnectivity.traceNet(trace)
            : undefined,
        )
      }
      if (via.pcb_trace_id) {
        const pcbTrace = circuitJson.find(
          (e) => e.type === "pcb_trace" && e.pcb_trace_id === via.pcb_trace_id,
        )
        if (pcbTrace?.type === "pcb_trace" && pcbTrace.source_trace_id) {
          const sourceTrace = circuitJson.find(
            (e) =>
              e.type === "source_trace" &&
              e.source_trace_id === pcbTrace.source_trace_id,
          )
          if (sourceTrace?.type === "source_trace")
            ownershipNets.push(sourceConnectivity.traceNet(sourceTrace))
        }
      }
      const knownNets = [
        ...new Set(ownershipNets.filter((net) => net !== undefined)),
      ]
      const net =
        knownNets.length === 1 && ownershipNets.every((n) => n !== undefined)
          ? knownNets[0]
          : undefined
      const layers = viaSpan(via, stackup)
      if (
        !layers ||
        !net ||
        ![via.x, via.y, via.outer_diameter, via.hole_diameter].every(
          Number.isFinite,
        ) ||
        via.hole_diameter < 0 ||
        via.outer_diameter <= via.hole_diameter
      ) {
        const possibleReferenceContact =
          ![via.x, via.y, via.outer_diameter, via.hole_diameter].every(
            Number.isFinite,
          ) ||
          this.planes.some(
            (plane) =>
              (!net || plane.net === net) &&
              (!layers || layers.includes(plane.layer)) &&
              annulusContact(
                via,
                via.outer_diameter / 2,
                via.hole_diameter / 2,
                plane.geometry,
              ) !== false,
          )
        if (possibleReferenceContact)
          this.unsupported.push(
            `${via.pcb_via_id}: possible reference contact has unknown net/span/annulus; disconnected-path conclusions are UNKNOWN`,
          )
        this.vias.push({
          via,
          layers,
          conductors: [],
          reason: !layers
            ? "physical span unknown/inconsistent"
            : !net
              ? "net unknown/ambiguous"
              : "invalid annulus",
        })
        continue
      }
      const contacts = this.conductors.filter(
        (c) =>
          layers.includes(c.layer) &&
          c.net === net &&
          annulusContact(
            via,
            via.outer_diameter / 2,
            via.hole_diameter / 2,
            c.geometry,
          ) === true,
      )
      if (
        this.conductors.some(
          (c) =>
            layers.includes(c.layer) &&
            c.net === net &&
            annulusContact(
              via,
              via.outer_diameter / 2,
              via.hole_diameter / 2,
              c.geometry,
            ) === "marginal",
        )
      )
        this.unsupported.push(
          `${via.pcb_via_id}: marginal annulus contact within 1e-8 mm tolerance`,
        )
      for (const contact of contacts)
        this.connectivity.join(`via:${via.pcb_via_id}`, contact.id)
      this.vias.push({ via, layers, conductors: contacts })
    }
    if (
      circuitJson.some(
        (e) => e.type === "pcb_plated_hole" || e.type === "pcb_thermal_spoke",
      )
    )
      this.unsupported.push(
        "plated holes and separate thermal spokes are not modeled; include solved spokes in filled polygons",
      )
  }
  plane(layer: string, net: SourceNetId) {
    return this.planes.find((p) => p.layer === layer && p.net === net)
  }
  planeConductors(plane: Plane, point?: DdrPoint) {
    return this.conductors.filter(
      (c) =>
        c.plane === plane &&
        (!point || hasContact(c.geometry, disk(point, 1e-6))),
    )
  }
  connected(a: Conductor, b: Conductor) {
    return this.connectivity.find(a.id) === this.connectivity.find(b.id)
  }
  anchors(plane: Plane, point: DdrPoint, sourceComponentId?: string) {
    const conductors = this.planeConductors(plane, point)
    return this.conductors
      .filter(
        (c) =>
          c.terminal &&
          (!sourceComponentId ||
            c.terminal.sourcePort.source_component_id === sourceComponentId) &&
          conductors.some((planeConductor) =>
            this.connected(c, planeConductor),
          ),
      )
      .map((c) => c.terminal!)
  }
  terminals(net: SourceNetId, sourceComponentId?: string) {
    return this.conductors
      .filter(
        (c) =>
          c.net === net &&
          c.terminal &&
          (!sourceComponentId ||
            c.terminal.sourcePort.source_component_id === sourceComponentId),
      )
      .map((c) => c.terminal!)
  }
  capacitorContacts(sourceComponentId: string, plane: Plane, point: DdrPoint) {
    return this.anchors(plane, point, sourceComponentId)
  }
}
