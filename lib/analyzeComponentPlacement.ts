import type {
  AnalysisLineItem,
  CardinalDirection,
  ComponentAnchorAlignment,
  ComponentBounds,
  ComponentPositionDefinedAs,
  ComponentSize,
  RelativeComponentEdgeToBoardEdgePosition,
  RelativeComponentToBoardPosition,
  RelativeComponentToComponentPosition,
} from "./types"

type CircuitElement = {
  type?: string
  [key: string]: unknown
}

export type AnalyzeComponentPlacementResult = {
  getLineItems: () => AnalysisLineItem[]
  getString: () => string
}

const CENTER_ANCHOR = "center"

const toNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

const fmtNumber = (value: number): string => {
  if (Number.isInteger(value)) return String(value)
  return value
    .toFixed(3)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1")
}

const fmtMm = (value: number): string => `${fmtNumber(value)}mm`

const withSignedMm = (value: number): string => {
  const abs = fmtMm(Math.abs(value))
  return value >= 0 ? `+${abs}` : `-${abs}`
}

const getComponentToComponentCalcString = (
  componentName: string,
  otherComponentName: string,
  direction: CardinalDirection,
  distance: number,
): string => {
  const d = fmtMm(distance)
  switch (direction) {
    case "right":
      return `${componentName}.pcbLeftEdgeX=calc(${otherComponentName}.maxX+${d})`
    case "left":
      return `${componentName}.pcbRightEdgeX=calc(${otherComponentName}.minX-${d})`
    case "up":
      return `${componentName}.pcbTopEdgeY=calc(${otherComponentName}.minY-${d})`
    case "down":
      return `${componentName}.pcbBottomEdgeY=calc(${otherComponentName}.maxY+${d})`
  }
}

const getComponentToBoardCalcString = (
  componentName: string,
  direction: CardinalDirection,
  distance: number,
): string => {
  const d = fmtMm(distance)
  switch (direction) {
    case "right":
      return `${componentName}.centerX=calc(board.centerX+${d})`
    case "left":
      return `${componentName}.centerX=calc(board.centerX-${d})`
    case "up":
      return `${componentName}.centerY=calc(board.centerY-${d})`
    case "down":
      return `${componentName}.centerY=calc(board.centerY+${d})`
  }
}

const getDirectionAndDistance = (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { direction: CardinalDirection; distance: number; axis: "x" | "y" } => {
  const dx = toX - fromX
  const dy = toY - fromY

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      direction: dx >= 0 ? "right" : "left",
      distance: Math.abs(dx),
      axis: "x",
    }
  }

  return {
    direction: dy >= 0 ? "up" : "down",
    distance: Math.abs(dy),
    axis: "y",
  }
}

const lineItemToString = (lineItem: AnalysisLineItem): string => {
  switch (lineItem.line_item_type) {
    case "absolute_component_position":
      return `${lineItem.component_name}.center=(${fmtMm(lineItem.anchor_position.x)}, ${fmtMm(lineItem.anchor_position.y)}) on ${lineItem.anchor_position.layer}`
    case "relative_component_to_component_position":
      return getComponentToComponentCalcString(
        lineItem.component_name,
        lineItem.other_component_name,
        lineItem.direction,
        lineItem.distance,
      )
    case "relative_component_to_board_position":
      return getComponentToBoardCalcString(
        lineItem.component_name,
        lineItem.direction,
        lineItem.distance,
      )
    case "component_position_defined_as": {
      const bits: string[] = []
      if (lineItem.x_definition) bits.push(`x=${lineItem.x_definition}`)
      if (lineItem.y_definition) bits.push(`y=${lineItem.y_definition}`)
      if (lineItem.placement_mode)
        bits.push(`placement_mode=${lineItem.placement_mode}`)
      if (bits.length === 0)
        return `${lineItem.component_name} has no explicit placement definition`
      return `${lineItem.component_name} placement definition: ${bits.join(", ")}`
    }
    case "component_anchor_alignment":
      return `${lineItem.component_name}.anchor_alignment="${lineItem.anchor_alignment}"`
    case "component_bounds":
      return `${lineItem.component_name}.bounds=(minX=${fmtMm(lineItem.min_x)}, maxX=${fmtMm(lineItem.max_x)}, minY=${fmtMm(lineItem.min_y)}, maxY=${fmtMm(lineItem.max_y)}, width=${fmtMm(lineItem.width)}, height=${fmtMm(lineItem.height)})`
    case "component_size":
      return `${lineItem.component_name}.size=(width=${fmtMm(lineItem.width)}, height=${fmtMm(lineItem.height)})`
    case "relative_component_edge_to_board_edge_position":
      return `${lineItem.component_name}.${lineItem.component_edge}=calc(${lineItem.board_edge}${withSignedMm(lineItem.offset)})`
    default:
      return ""
  }
}

export const analyzeComponentPlacement = (
  circuitJson: CircuitElement[],
  componentName: string,
): AnalyzeComponentPlacementResult => {
  const sourceComponent = circuitJson.find(
    (el) => el.type === "source_component" && el.name === componentName,
  )

  const sourceComponentId =
    typeof sourceComponent?.source_component_id === "string"
      ? sourceComponent.source_component_id
      : null

  const lineItems: AnalysisLineItem[] = []

  if (!sourceComponent || !sourceComponentId) {
    return {
      getLineItems: () => [],
      getString: () => `Component ${componentName} was not found`,
    }
  }

  const pcbComponent = circuitJson.find(
    (el) =>
      el.type === "pcb_component" &&
      el.source_component_id === sourceComponentId,
  )

  const center =
    pcbComponent &&
    typeof pcbComponent.center === "object" &&
    pcbComponent.center
      ? (pcbComponent.center as { x?: unknown; y?: unknown })
      : null

  const centerX = center ? toNumber(center.x) : null
  const centerY = center ? toNumber(center.y) : null
  const layer =
    typeof pcbComponent?.layer === "string" ? (pcbComponent.layer as any) : null

  if (centerX !== null && centerY !== null && layer !== null) {
    lineItems.push({
      line_item_type: "absolute_component_position",
      component_name: componentName,
      anchor_alignment: CENTER_ANCHOR,
      anchor_position: {
        x: centerX,
        y: centerY,
        layer,
      },
    })
  }

  const componentWidth = toNumber(pcbComponent?.width)
  const componentHeight = toNumber(pcbComponent?.height)

  let componentBounds: ComponentBounds | null = null

  if (
    centerX !== null &&
    centerY !== null &&
    componentWidth !== null &&
    componentHeight !== null
  ) {
    const halfWidth = componentWidth / 2
    const halfHeight = componentHeight / 2
    componentBounds = {
      line_item_type: "component_bounds",
      component_name: componentName,
      width: componentWidth,
      height: componentHeight,
      min_x: centerX - halfWidth,
      max_x: centerX + halfWidth,
      min_y: centerY - halfHeight,
      max_y: centerY + halfHeight,
    }
    lineItems.push(componentBounds)

    const componentSize: ComponentSize = {
      line_item_type: "component_size",
      component_name: componentName,
      width: componentWidth,
      height: componentHeight,
    }
    lineItems.push(componentSize)
  }

  const anchorAlignmentFromSilk =
    typeof pcbComponent?.pcb_component_id === "string"
      ? circuitJson.find(
          (el) =>
            el.type === "pcb_silkscreen_text" &&
            el.pcb_component_id === pcbComponent.pcb_component_id &&
            typeof el.anchor_alignment === "string",
        )
      : null

  const anchorAlignment =
    typeof anchorAlignmentFromSilk?.anchor_alignment === "string"
      ? (anchorAlignmentFromSilk.anchor_alignment as ComponentAnchorAlignment["anchor_alignment"])
      : CENTER_ANCHOR

  lineItems.push({
    line_item_type: "component_anchor_alignment",
    component_name: componentName,
    anchor_alignment: anchorAlignment,
  })

  const xDefinitionRaw =
    sourceComponent.pcbX ?? sourceComponent.pcb_x ?? sourceComponent.x
  const yDefinitionRaw =
    sourceComponent.pcbY ?? sourceComponent.pcb_y ?? sourceComponent.y

  const xDefinition =
    xDefinitionRaw === undefined ? undefined : String(xDefinitionRaw)
  const yDefinition =
    yDefinitionRaw === undefined ? undefined : String(yDefinitionRaw)

  let placementMode: ComponentPositionDefinedAs["placement_mode"] = "none"
  if (xDefinition !== undefined || yDefinition !== undefined) {
    placementMode = "props_set"
  } else if (
    sourceComponent.placement_mode === "auto" ||
    pcbComponent?.position_mode === "auto"
  ) {
    placementMode = "auto"
  }

  lineItems.push({
    line_item_type: "component_position_defined_as",
    component_name: componentName,
    x_definition: xDefinition,
    y_definition: yDefinition,
    placement_mode: placementMode,
  })

  const pcbBoard = circuitJson.find((el) => el.type === "pcb_board")
  const boardCenter =
    pcbBoard && typeof pcbBoard.center === "object" && pcbBoard.center
      ? (pcbBoard.center as { x?: unknown; y?: unknown })
      : null
  const boardCenterX = boardCenter ? toNumber(boardCenter.x) : null
  const boardCenterY = boardCenter ? toNumber(boardCenter.y) : null

  if (
    componentBounds !== null &&
    boardCenterX !== null &&
    boardCenterY !== null &&
    toNumber(pcbBoard?.width) !== null &&
    toNumber(pcbBoard?.height) !== null
  ) {
    const boardWidth = toNumber(pcbBoard?.width)!
    const boardHeight = toNumber(pcbBoard?.height)!
    const boardMinX = boardCenterX - boardWidth / 2
    const boardMaxX = boardCenterX + boardWidth / 2
    const boardMinY = boardCenterY - boardHeight / 2
    const boardMaxY = boardCenterY + boardHeight / 2

    const leftOffsetFromBoardMinX = componentBounds.min_x - boardMinX
    const rightOffsetFromBoardMaxX = componentBounds.max_x - boardMaxX
    const topOffsetFromBoardMinY = componentBounds.min_y - boardMinY
    const bottomOffsetFromBoardMaxY = componentBounds.max_y - boardMaxY

    const nearestHorizontal: RelativeComponentEdgeToBoardEdgePosition =
      Math.abs(leftOffsetFromBoardMinX) <= Math.abs(rightOffsetFromBoardMaxX)
        ? {
            line_item_type: "relative_component_edge_to_board_edge_position",
            component_name: componentName,
            component_edge: "pcbLeftEdgeX",
            board_edge: "board.minX",
            offset: leftOffsetFromBoardMinX,
          }
        : {
            line_item_type: "relative_component_edge_to_board_edge_position",
            component_name: componentName,
            component_edge: "pcbRightEdgeX",
            board_edge: "board.maxX",
            offset: rightOffsetFromBoardMaxX,
          }

    const nearestVertical: RelativeComponentEdgeToBoardEdgePosition =
      Math.abs(topOffsetFromBoardMinY) <= Math.abs(bottomOffsetFromBoardMaxY)
        ? {
            line_item_type: "relative_component_edge_to_board_edge_position",
            component_name: componentName,
            component_edge: "pcbTopEdgeY",
            board_edge: "board.minY",
            offset: topOffsetFromBoardMinY,
          }
        : {
            line_item_type: "relative_component_edge_to_board_edge_position",
            component_name: componentName,
            component_edge: "pcbBottomEdgeY",
            board_edge: "board.maxY",
            offset: bottomOffsetFromBoardMaxY,
          }

    lineItems.push(nearestHorizontal)
    lineItems.push(nearestVertical)

    const boardRelation = getDirectionAndDistance(
      boardCenterX,
      boardCenterY,
      componentBounds.min_x + componentBounds.width / 2,
      componentBounds.min_y + componentBounds.height / 2,
    )
    const boardLineItem: RelativeComponentToBoardPosition = {
      line_item_type: "relative_component_to_board_position",
      component_name: componentName,
      anchor_alignment: CENTER_ANCHOR,
      board_anchor_alignment: CENTER_ANCHOR,
      direction: boardRelation.direction,
      distance: boardRelation.distance,
      calc_distance: `abs(${componentName}.center.${boardRelation.axis} - board.center.${boardRelation.axis})`,
    }
    lineItems.push(boardLineItem)
  }

  if (centerX !== null && centerY !== null) {
    const sourceComponentsById = new Map<string, string>()
    for (const el of circuitJson) {
      if (
        el.type === "source_component" &&
        typeof el.source_component_id === "string" &&
        typeof el.name === "string"
      ) {
        sourceComponentsById.set(el.source_component_id, el.name)
      }
    }

    const otherPcbComponents = circuitJson.filter(
      (el) =>
        el.type === "pcb_component" &&
        el.source_component_id !== sourceComponentId &&
        typeof el.source_component_id === "string",
    )

    let closest: {
      name: string
      centerX: number
      centerY: number
      score: number
    } | null = null

    for (const other of otherPcbComponents) {
      const otherName = sourceComponentsById.get(
        other.source_component_id as string,
      )
      if (!otherName) continue

      const otherCenter =
        typeof other.center === "object" && other.center
          ? (other.center as { x?: unknown; y?: unknown })
          : null
      const otherCenterX = otherCenter ? toNumber(otherCenter.x) : null
      const otherCenterY = otherCenter ? toNumber(otherCenter.y) : null
      if (otherCenterX === null || otherCenterY === null) continue

      const dx = otherCenterX - centerX
      const dy = otherCenterY - centerY
      const score = Math.hypot(dx, dy)

      if (!closest || score < closest.score) {
        closest = {
          name: otherName,
          centerX: otherCenterX,
          centerY: otherCenterY,
          score,
        }
      }
    }

    if (closest) {
      const relation = getDirectionAndDistance(
        closest.centerX,
        closest.centerY,
        centerX,
        centerY,
      )

      const relativeLineItem: RelativeComponentToComponentPosition = {
        line_item_type: "relative_component_to_component_position",
        component_name: componentName,
        anchor_alignment: CENTER_ANCHOR,
        other_component_name: closest.name,
        other_anchor_alignment: CENTER_ANCHOR,
        direction: relation.direction,
        distance: relation.distance,
        calc_distance: `abs(${componentName}.center.${relation.axis} - ${closest.name}.center.${relation.axis})`,
      }

      lineItems.push(relativeLineItem)
    }
  }

  return {
    getLineItems: () => lineItems,
    getString: () => lineItems.map(lineItemToString).join("\n"),
  }
}
