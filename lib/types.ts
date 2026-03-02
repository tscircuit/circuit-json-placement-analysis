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

export type AnalysisLineItem =
  | AbsoluteComponentPosition
  | RelativeComponentToComponentPosition
  | RelativeComponentToBoardPosition
  | ComponentPositionDefinedAs
