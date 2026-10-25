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
  /** Reference candidates, including both neighboring layers when identifiable. */
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
  /** Advisory analyzer policy, never a universal DDR distance. */
  maxReturnViaDistanceMm?: number
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
  scope: "signal_candidates"
  ddrMembership: "unknown"
  assumptions: string[]
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

export type DdrSolverStage =
  | "input"
  | "references"
  | "copper"
  | "coverage"
  | "transitions"
  | "report"

/** Completed work only; no future findings are exposed while stepping. */
export interface DdrSolverState {
  stage: DdrSolverStage
  completedStages: DdrSolverStage[]
  status: "running" | "complete" | "blocked"
  findings: DdrFinding[]
  newFindingIds: string[]
  location?: DdrLocation
  reason?: string
  copper: {
    layer: string
    sourceNetId: SourceNetId
    /** Clipped polygons, each containing its outer ring followed by holes. */
    polygons: DdrPoint[][][]
  }[]
  viaContacts: {
    pcbViaId: PcbViaId
    sourceNetId?: SourceNetId
    span: string[]
    /** Positive-area same-net reference contacts; not a cross-net short test. */
    contactLayers: string[]
  }[]
}
