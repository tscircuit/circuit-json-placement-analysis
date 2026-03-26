import type { LayerRef, NinePointAnchor } from "circuit-json"

export interface AnchorPosition {
  x: number
  y: number
  layer: LayerRef
}

export type CardinalDirection = "up" | "down" | "left" | "right"

export interface AbsoluteComponentPosition {
  line_item_type: "absolute_component_position"
  component_name: string
  anchor_alignment: NinePointAnchor
  anchor_position: AnchorPosition
}

export interface RelativeComponentToComponentPosition {
  line_item_type: "relative_component_to_component_position"
  component_name: string
  anchor_alignment: NinePointAnchor
  other_component_name: string
  other_anchor_alignment: NinePointAnchor
  direction: CardinalDirection
  distance: number
  calc_distance: string
}

export interface RelativeComponentToBoardPosition {
  line_item_type: "relative_component_to_board_position"
  component_name: string
  anchor_alignment: NinePointAnchor
  board_anchor_alignment: NinePointAnchor
  direction: CardinalDirection
  distance: number
  calc_distance: string
}

export interface ComponentPositionDefinedAs {
  line_item_type: "component_position_defined_as"
  component_name: string
  x_definition?: string
  y_definition?: string
  placement_mode?: "none" | "auto" | "props_set"
}

export interface ComponentAnchorAlignment {
  line_item_type: "component_anchor_alignment"
  component_name: string
  anchor_alignment: NinePointAnchor
}

export interface ComponentBounds {
  line_item_type: "component_bounds"
  component_name: string
  width: number
  height: number
  min_x: number
  max_x: number
  min_y: number
  max_y: number
}

export interface ComponentSize {
  line_item_type: "component_size"
  component_name: string
  width: number
  height: number
}

export interface ComponentOrientation {
  line_item_type: "component_orientation"
  component_name: string
  orientation: "horizontal" | "vertical"
}

export interface RelativeComponentEdgeToBoardEdgePosition {
  line_item_type: "relative_component_edge_to_board_edge_position"
  component_name: string
  component_edge:
    | "pcbLeftEdgeX"
    | "pcbRightEdgeX"
    | "pcbTopEdgeY"
    | "pcbBottomEdgeY"
  board_edge: "board.minX" | "board.maxX" | "board.minY" | "board.maxY"
  offset: number
}

export interface ComponentPadClearance {
  line_item_type: "component_pad_clearance"
  component_name: string
  clearance: number
  nearest_component_name: string
  nearest_pad_name: string
}

export interface DirectPinToPinDistance {
  line_item_type: "direct_pin_to_pin_distance"
  component_name: string
  from_pin_name: string
  to_pin_name: string
  distance: number
}

export interface ComponentBoardEdgeStatus {
  component_name: string
  edge: "left" | "right" | "top" | "bottom"
  status: "inside" | "outside"
  distance: number
}

export type PlacementIssueType =
  | "off_board"
  | "pad_overlap"
  | "courtyard_collision"
  | "connector_body_intrusion"
  | "footprint_intrusion"

export interface PlacementIssue {
  type: PlacementIssueType
  componentA: string
  componentB?: string
  clearance: number
  severity: number
  summary: string
  suggested_move?: string
}

export interface PlacementCluster {
  clusterName: string
  componentNames: string[]
  severity: number
}

export interface PlacementComponentStatus {
  componentName: string
  placementMode: "none" | "auto" | "props_set"
  sourcePlacement: {
    xDefinition?: string
    yDefinition?: string
  }
  resolvedPlacement: {
    center?: AnchorPosition
    bounds?: {
      width: number
      height: number
      min_x: number
      max_x: number
      min_y: number
      max_y: number
    }
    anchorAlignment: NinePointAnchor
    orientation?: "horizontal" | "vertical"
  }
  boardEdgeStatus?: ComponentBoardEdgeStatus | null
  issues: PlacementIssue[]
}

export interface PlacementAnalysisReport {
  summary: {
    totalIssueCount: number
    countsByType: Partial<Record<PlacementIssueType, number>>
    topIssues: PlacementIssue[]
    likelyBadClusters: PlacementCluster[]
  }
  components: PlacementComponentStatus[]
  issues: PlacementIssue[]
}
export type AnalysisLineItem =
  | AbsoluteComponentPosition
  | RelativeComponentToComponentPosition
  | RelativeComponentToBoardPosition
  | ComponentPositionDefinedAs
  | ComponentAnchorAlignment
  | ComponentBounds
  | ComponentSize
  | ComponentOrientation
  | RelativeComponentEdgeToBoardEdgePosition
  | ComponentPadClearance
  | DirectPinToPinDistance
