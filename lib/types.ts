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
