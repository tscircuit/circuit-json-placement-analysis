import type {
  PcbCopperPour,
  PcbPort,
  PcbTrace,
  PcbVia,
  SourceNet,
  SourceTrace,
} from "circuit-json"

export type SourceNetId = SourceNet["source_net_id"]
export type SourceTraceId = SourceTrace["source_trace_id"]
export type PcbTraceId = PcbTrace["pcb_trace_id"]
export type PcbViaId = PcbVia["pcb_via_id"]
export type PcbPortId = PcbPort["pcb_port_id"]
export type PcbCopperPourId = PcbCopperPour["pcb_copper_pour_id"]
/** Board-world points in mm: +X right, +Y up, right-handed; layers run top to bottom (+Z to -Z). */
export interface DdrPoint {
  x: number
  y: number
}
export interface DdrReference {
  signalLayer: string
  referenceLayer: string
  sourceNetId: SourceNetId
}
export interface DdrStackup {
  /** Declared means supplied design metadata, never a measurement of fabricated hardware. */
  provenance: { kind: "declared" | "assumed"; source: string }
  /** Ordered copper layers, top to bottom. No electrical role is inferred from num_layers. */
  copperLayers: string[]
  /** Include every assigned reference, including both sides of stripline. */
  references: DdrReference[]
}
export interface DdrGroup {
  name: string
  sourceNetIds?: SourceNetId[]
  sourceTraceIds?: SourceTraceId[]
  provenance: string
}
export interface DdrPolicy {
  name: string
  provenance: string
  preferGround?: boolean
  requireAdjacentReference?: boolean
  /** Caller policy, never a universal DDR distance; omitted proximity is UNKNOWN. */
  maxReturnViaDistanceMm?: number
}
export interface DdrAntipad {
  pcbViaId: PcbViaId
  pcbCopperPourId: PcbCopperPourId
  innerRingIndex: number
  /** Explicit clearance extent; only isolated bounded holes at this signal transition qualify. */
  maxRadiusMm: number
  provenance: string
}
export interface DdrPlacementOptions {
  groups?: DdrGroup[]
  stackup?: DdrStackup
  /** Identify final solved fill, including all clearances/holes. Requested pour outlines are insufficient. */
  filledCopper?: { pcbCopperPourIds: PcbCopperPourId[]; provenance: string }
  policy?: DdrPolicy
  signalViaAntipads?: DdrAntipad[]
}
export type DdrSeverity =
  | "error"
  | "policy_violation"
  | "warning"
  | "unknown"
  | "info"
export interface DdrLocation {
  sourceNetId?: SourceNetId
  sourceTraceId?: SourceTraceId
  pcbTraceId?: PcbTraceId
  component?: string
  layers?: string[]
  pcbCopperPourIds?: PcbCopperPourId[]
  pcbViaIds?: PcbViaId[]
  pcbPortIds?: PcbPortId[]
  segmentIndex?: number
  start?: DdrPoint
  end?: DdrPoint
}
export interface DdrFinding {
  id: string
  code: string
  severity: DdrSeverity
  summary: string
  location: DdrLocation
  evidence: string[]
  repairHint: string
  provenance: string[]
}
export interface DdrPlacementReport {
  status: "issues_found" | "incomplete" | "no_issues_in_evaluated_checks"
  stackup: DdrStackup | null
  policy: DdrPolicy
  groups: DdrGroup[]
  /** Display labels only; never used to infer membership, roles or physical contact. */
  netNames?: Record<SourceNetId, string>
  checks: {
    referenceSegments: number
    referenceTransitions: number
  }
  findings: DdrFinding[]
  limits: string[]
}
export interface AnalyzeDdrPlacementResult {
  getString: () => string
  getIssues: () => DdrFinding[]
  getReport: () => DdrPlacementReport
}
