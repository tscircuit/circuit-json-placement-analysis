import type {
  AnalysisLineItem,
  CardinalDirection,
  ComponentAnchorAlignment,
  ComponentBounds,
  ComponentOrientation,
  ComponentPadClearance,
  DirectPinToPinDistance,
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

const isOffBoardEdgeOffset = (
  boardEdge: "board.minX" | "board.maxX" | "board.minY" | "board.maxY",
  offset: number,
): boolean => {
  if (boardEdge === "board.minX" || boardEdge === "board.minY") {
    return offset < 0
  }
  return offset > 0
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

const getPadBounds = (
  element: CircuitElement,
): { minX: number; maxX: number; minY: number; maxY: number } | null => {
  if (element.type === "pcb_smtpad") {
    const x = toNumber(element.x)
    const y = toNumber(element.y)
    const width = toNumber(element.width)
    const height = toNumber(element.height)
    if (x === null || y === null || width === null || height === null)
      return null
    return {
      minX: x - width / 2,
      maxX: x + width / 2,
      minY: y - height / 2,
      maxY: y + height / 2,
    }
  }

  if (element.type === "pcb_plated_hole") {
    const x = toNumber(element.x)
    const y = toNumber(element.y)
    const rectPadWidth = toNumber(element.rect_pad_width)
    const rectPadHeight = toNumber(element.rect_pad_height)
    const holeDiameter = toNumber(element.hole_diameter)
    if (x === null || y === null) return null

    const width = rectPadWidth ?? holeDiameter
    const height = rectPadHeight ?? holeDiameter
    if (width === null || height === null) return null

    return {
      minX: x - width / 2,
      maxX: x + width / 2,
      minY: y - height / 2,
      maxY: y + height / 2,
    }
  }

  return null
}

const getBoundsClearance = (
  a: { minX: number; maxX: number; minY: number; maxY: number },
  b: { minX: number; maxX: number; minY: number; maxY: number },
): number => {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX)
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY)
  return Math.hypot(dx, dy)
}

const getPadDisplayName = (
  pad: CircuitElement,
  componentName: string,
  sourcePortNameByPcbPortId: Map<string, string>,
): string => {
  const pcbPortId =
    typeof pad.pcb_port_id === "string" ? (pad.pcb_port_id as string) : null

  if (pcbPortId) {
    const sourcePortName = sourcePortNameByPcbPortId.get(pcbPortId)
    if (sourcePortName) return `${componentName}.${sourcePortName}`
  }

  if (Array.isArray(pad.port_hints)) {
    const pinHint = pad.port_hints.find(
      (hint) => typeof hint === "string" && /^pin\d+$/i.test(hint),
    )
    if (typeof pinHint === "string") return `${componentName}.${pinHint}`

    const numericHint = pad.port_hints.find(
      (hint) => typeof hint === "string" && /^\d+$/.test(hint),
    )
    if (typeof numericHint === "string")
      return `${componentName}.pin${numericHint}`
  }

  if (pcbPortId) return `${componentName}.${pcbPortId}`
  return `${componentName}.pad`
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

const getPinCenter = (pad: CircuitElement): { x: number; y: number } | null => {
  const x = toNumber(pad.x)
  const y = toNumber(pad.y)
  if (x === null || y === null) return null
  return { x, y }
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
      return `${lineItem.component_name}.bounds=(minX=${fmtMm(lineItem.min_x)}, maxX=${fmtMm(lineItem.max_x)}, minY=${fmtMm(lineItem.min_y)}, maxY=${fmtMm(lineItem.max_y)})`
    case "component_size":
      return `${lineItem.component_name}.size=(width=${fmtMm(lineItem.width)}, height=${fmtMm(lineItem.height)})`
    case "component_orientation":
      return `${lineItem.component_name}.orientation=${lineItem.orientation}`
    case "relative_component_edge_to_board_edge_position":
      return `${lineItem.component_name}.${lineItem.component_edge}=calc(${lineItem.board_edge}${withSignedMm(lineItem.offset)})${isOffBoardEdgeOffset(lineItem.board_edge, lineItem.offset) ? " [offboard]" : ""}`
    case "component_pad_clearance":
      return `${lineItem.component_name}.padClearance=${fmtMm(lineItem.clearance)} [nearest=${lineItem.nearest_pad_name}]`
    case "direct_pin_to_pin_distance":
      return `${lineItem.from_pin_name} -> ${lineItem.to_pin_name} distance: ${fmtMm(lineItem.distance)}`
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

    if (sourceComponent.ftype === "simple_pin_header") {
      const componentOrientation: ComponentOrientation = {
        line_item_type: "component_orientation",
        component_name: componentName,
        orientation:
          componentWidth >= componentHeight ? "horizontal" : "vertical",
      }
      lineItems.push(componentOrientation)
    }
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

  const sourcePortNameByPcbPortId = new Map<string, string>()

  for (const el of circuitJson) {
    if (
      el.type === "pcb_port" &&
      typeof el.pcb_port_id === "string" &&
      typeof el.source_port_id === "string"
    ) {
      const sourcePort = circuitJson.find(
        (candidate) =>
          candidate.type === "source_port" &&
          candidate.source_port_id === el.source_port_id &&
          typeof candidate.name === "string",
      )

      if (sourcePort && typeof sourcePort.name === "string") {
        sourcePortNameByPcbPortId.set(el.pcb_port_id, sourcePort.name)
      }
    }
  }

  const sourcePortById = new Map<string, CircuitElement>()
  for (const el of circuitJson) {
    if (el.type === "source_port" && typeof el.source_port_id === "string") {
      sourcePortById.set(el.source_port_id, el)
    }
  }

  const sourcePortDisplayNameById = new Map<string, string>()
  for (const el of circuitJson) {
    if (el.type === "source_port" && typeof el.source_port_id === "string") {
      if (
        typeof el.source_component_id === "string" &&
        typeof el.name === "string"
      ) {
        const sourceComp = circuitJson.find(
          (candidate) =>
            candidate.type === "source_component" &&
            candidate.source_component_id === el.source_component_id &&
            typeof candidate.name === "string",
        )
        if (sourceComp && typeof sourceComp.name === "string") {
          sourcePortDisplayNameById.set(
            el.source_port_id,
            `${sourceComp.name}.${el.name}`,
          )
          continue
        }
      }
      if (typeof el.name === "string") {
        sourcePortDisplayNameById.set(el.source_port_id, el.name)
      }
    }
  }

  const padBySourcePortId = new Map<
    string,
    { pad: CircuitElement; padName: string; center: { x: number; y: number } }
  >()

  if (typeof pcbComponent?.pcb_component_id === "string") {
    for (const el of circuitJson) {
      if (
        (el.type === "pcb_smtpad" || el.type === "pcb_plated_hole") &&
        typeof el.pcb_component_id === "string" &&
        typeof el.pcb_port_id === "string"
      ) {
        const pcbPort = circuitJson.find(
          (candidate) =>
            candidate.type === "pcb_port" &&
            candidate.pcb_port_id === el.pcb_port_id &&
            typeof candidate.source_port_id === "string",
        )
        if (!pcbPort || typeof pcbPort.source_port_id !== "string") continue
        const center = getPinCenter(el)
        if (!center) continue

        const sourcePort = sourcePortById.get(pcbPort.source_port_id)
        const sourcePortComponentId =
          typeof sourcePort?.source_component_id === "string"
            ? sourcePort.source_component_id
            : null
        if (sourcePortComponentId !== sourceComponentId) continue

        padBySourcePortId.set(pcbPort.source_port_id, {
          pad: el,
          padName: getPadDisplayName(
            el,
            componentName,
            sourcePortNameByPcbPortId,
          ),
          center,
        })
      }
    }
  }

  const directPinDistanceLineItems: DirectPinToPinDistance[] = []

  for (const fromPortId of padBySourcePortId.keys()) {
    const directPinToPinTraces = circuitJson.filter(
      (el) =>
        el.type === "source_trace" &&
        Array.isArray(el.connected_source_port_ids) &&
        el.connected_source_port_ids.length === 2 &&
        el.connected_source_port_ids.includes(fromPortId) &&
        Array.isArray(el.connected_source_net_ids) &&
        el.connected_source_net_ids.length === 0,
    )

    if (directPinToPinTraces.length !== 1) continue

    const trace = directPinToPinTraces[0]
    if (!trace) continue
    const connectedPortIds = Array.isArray(trace.connected_source_port_ids)
      ? trace.connected_source_port_ids.filter(
          (value): value is string => typeof value === "string",
        )
      : []

    const otherPortId = connectedPortIds.find((portId) => portId !== fromPortId)
    if (!otherPortId) continue

    const fromPin = padBySourcePortId.get(fromPortId)
    if (!fromPin) continue

    const otherPcbPort = circuitJson.find(
      (candidate) =>
        candidate.type === "pcb_port" &&
        candidate.source_port_id === otherPortId &&
        typeof candidate.pcb_port_id === "string",
    )

    if (!otherPcbPort || typeof otherPcbPort.pcb_port_id !== "string") continue

    const otherPad = circuitJson.find(
      (candidate) =>
        (candidate.type === "pcb_smtpad" ||
          candidate.type === "pcb_plated_hole") &&
        candidate.pcb_port_id === otherPcbPort.pcb_port_id,
    )

    if (!otherPad) continue

    const otherCenter = getPinCenter(otherPad)
    if (!otherCenter) continue

    const fromPortDisplayName = sourcePortDisplayNameById.get(fromPortId)
    const toPortDisplayName = sourcePortDisplayNameById.get(otherPortId)

    if (!fromPortDisplayName || !toPortDisplayName) continue

    directPinDistanceLineItems.push({
      line_item_type: "direct_pin_to_pin_distance",
      component_name: componentName,
      from_pin_name: fromPortDisplayName,
      to_pin_name: toPortDisplayName,
      distance: Math.hypot(
        otherCenter.x - fromPin.center.x,
        otherCenter.y - fromPin.center.y,
      ),
    })
  }

  lineItems.push(...directPinDistanceLineItems)

  const componentPadBounds =
    typeof pcbComponent?.pcb_component_id === "string"
      ? circuitJson
          .filter(
            (el) =>
              (el.type === "pcb_smtpad" || el.type === "pcb_plated_hole") &&
              el.pcb_component_id === pcbComponent.pcb_component_id,
          )
          .map((pad) => {
            const bounds = getPadBounds(pad)
            if (!bounds) return null
            return {
              bounds,
              padName: getPadDisplayName(
                pad,
                componentName,
                sourcePortNameByPcbPortId,
              ),
            }
          })
          .filter((pad): pad is NonNullable<typeof pad> => pad !== null)
      : []

  if (
    componentPadBounds.length > 0 &&
    typeof pcbComponent?.pcb_component_id === "string"
  ) {
    const sourceComponentNameByPcbComponentId = new Map<string, string>()

    for (const el of circuitJson) {
      if (
        el.type === "pcb_component" &&
        typeof el.pcb_component_id === "string" &&
        typeof el.source_component_id === "string"
      ) {
        const sourceName = circuitJson.find(
          (candidate) =>
            candidate.type === "source_component" &&
            candidate.source_component_id === el.source_component_id &&
            typeof candidate.name === "string",
        )
        if (sourceName && typeof sourceName.name === "string") {
          sourceComponentNameByPcbComponentId.set(
            el.pcb_component_id,
            sourceName.name,
          )
        }
      }
    }

    const otherComponentPadBounds = circuitJson
      .filter(
        (el) =>
          (el.type === "pcb_smtpad" || el.type === "pcb_plated_hole") &&
          typeof el.pcb_component_id === "string" &&
          el.pcb_component_id !== pcbComponent.pcb_component_id,
      )
      .map((el) => {
        const bounds = getPadBounds(el)
        if (!bounds) return null
        const otherComponentName = sourceComponentNameByPcbComponentId.get(
          el.pcb_component_id as string,
        )
        if (!otherComponentName) return null
        return {
          bounds,
          componentName: otherComponentName,
          padName: getPadDisplayName(
            el,
            otherComponentName,
            sourcePortNameByPcbPortId,
          ),
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    let nearestPadClearance: {
      clearance: number
      componentName: string
      padName: string
    } | null = null

    for (const ownPad of componentPadBounds) {
      for (const otherPad of otherComponentPadBounds) {
        const clearance = getBoundsClearance(ownPad.bounds, otherPad.bounds)
        if (!nearestPadClearance || clearance < nearestPadClearance.clearance) {
          nearestPadClearance = {
            clearance,
            componentName: otherPad.componentName,
            padName: otherPad.padName,
          }
        }
      }
    }

    if (nearestPadClearance) {
      const padClearanceLineItem: ComponentPadClearance = {
        line_item_type: "component_pad_clearance",
        component_name: componentName,
        clearance: nearestPadClearance.clearance,
        nearest_component_name: nearestPadClearance.componentName,
        nearest_pad_name: nearestPadClearance.padName,
      }
      lineItems.push(padClearanceLineItem)
    }
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
