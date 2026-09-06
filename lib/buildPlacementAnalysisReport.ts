import Flatbush from "flatbush"
import RBush from "rbush"
import type { LayerRef, NinePointAnchor, PcbPort } from "circuit-json"
import { shapesOverlap, type CourtyardShape } from "./courtyardGeometry"
import type {
  PlacementAreaBounds,
  ComponentBoardEdgeStatus,
  PlacementAnalysisReport,
  PlacementEmptySpace,
  PlacementBoardTopLayerReport,
  PlacementCluster,
  PlacementComponentStatus,
  PlacementIssue,
  PlacementIssueType,
} from "./types"

type CircuitElement = {
  type?: string
  [key: string]: unknown
}

type Bounds = PlacementAreaBounds

type PhysicalShape = CourtyardShape & {
  layers: LayerRef[]
}

type BoardSide = "top" | "bottom"

type SourcePortId = string
type SourceComponentId = string

const isPcbPort = (
  circuitElement: CircuitElement,
): circuitElement is CircuitElement & PcbPort => {
  if (circuitElement.type !== "pcb_port") return false
  if (typeof circuitElement.pcb_port_id !== "string") return false
  if (typeof circuitElement.source_port_id !== "string") return false
  if (typeof circuitElement.x !== "number") return false
  if (!Number.isFinite(circuitElement.x)) return false
  if (typeof circuitElement.y !== "number") return false
  if (!Number.isFinite(circuitElement.y)) return false
  if (!Array.isArray(circuitElement.layers)) return false

  for (const layer of circuitElement.layers) {
    if (typeof layer !== "string") return false
  }

  return true
}

type ComponentContext = {
  name: string
  sourceComponent: CircuitElement
  sourceComponentId: SourceComponentId
  pcbComponent: CircuitElement | null
  pcbComponentId: string | null
  centerX: number | null
  centerY: number | null
  layer: LayerRef | null
  width: number | null
  height: number | null
  bounds: Bounds | null
  anchorAlignment: NinePointAnchor
  orientation?: "horizontal" | "vertical"
  placementMode: "none" | "auto" | "props_set"
  xDefinition?: string
  yDefinition?: string
  pads: PhysicalShape[]
  courtyards: PhysicalShape[]
  isConnectorLike: boolean
  order: number
}

const TOP_ISSUE_LIMIT = 5
const CENTER_ANCHOR = "center"
const LARGE_EMPTY_SPACE_THRESHOLD_RATIO = 0.05
const EMPTY_SPACE_SAMPLE_STEP_MM = 5
const GEOMETRY_EPSILON = 1e-6
const SUBOPTIMAL_ORIENTATION_SEVERITY = 100

const ISSUE_TYPE_ORDER: PlacementIssueType[] = [
  "pad_overlap",
  "off_board",
  "courtyard_collision",
  "connector_body_intrusion",
  "footprint_intrusion",
  "suboptimal_orientation",
]

const toNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

const getLayer = (value: unknown): LayerRef | null =>
  typeof value === "string" ? (value as LayerRef) : null

const isBoardSide = (layer: LayerRef | null): layer is BoardSide =>
  layer === "top" || layer === "bottom"

const fmtNumber = (value: number): string => {
  if (Number.isInteger(value)) return String(value)
  return value
    .toFixed(3)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1")
}

const fmtMm = (value: number): string => `${fmtNumber(value)}mm`

const fmtArea = (value: number): string => `${fmtNumber(value)}mm^2`

const fmtPercent = (value: number): string => `${fmtNumber(value)}%`

const getBoundsFromCenterAndSize = (
  centerX: number,
  centerY: number,
  width: number,
  height: number,
): Bounds => ({
  min_x: centerX - width / 2,
  max_x: centerX + width / 2,
  min_y: centerY - height / 2,
  max_y: centerY + height / 2,
  width,
  height,
})

const getBoundsFromPoints = (
  points: Array<{ x?: unknown; y?: unknown }>,
): Bounds | null => {
  const xs: number[] = []
  const ys: number[] = []

  for (const point of points) {
    const x = toNumber(point.x)
    const y = toNumber(point.y)
    if (x === null || y === null) continue
    xs.push(x)
    ys.push(y)
  }

  if (xs.length === 0 || ys.length === 0) return null

  const min_x = Math.min(...xs)
  const max_x = Math.max(...xs)
  const min_y = Math.min(...ys)
  const max_y = Math.max(...ys)

  return {
    min_x,
    max_x,
    min_y,
    max_y,
    width: max_x - min_x,
    height: max_y - min_y,
  }
}

const getBoundsFromRotatedCenterAndSize = (
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  ccwRotation: number,
): Bounds => {
  const halfWidth = width / 2
  const halfHeight = height / 2
  const angle = (ccwRotation * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  return getBoundsFromPoints(
    [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight },
    ].map(({ x, y }) => ({
      x: centerX + x * cos - y * sin,
      y: centerY + x * sin + y * cos,
    })),
  )!
}

const getOverlap = (
  a: Bounds,
  b: Bounds,
): { overlapX: number; overlapY: number; clearance: number } | null => {
  const overlapX = Math.min(a.max_x, b.max_x) - Math.max(a.min_x, b.min_x)
  const overlapY = Math.min(a.max_y, b.max_y) - Math.max(a.min_y, b.min_y)

  if (overlapX <= 0 || overlapY <= 0) return null

  return {
    overlapX,
    overlapY,
    clearance: -Math.min(overlapX, overlapY),
  }
}

const getBoundsIntersection = (a: Bounds, b: Bounds): Bounds | null => {
  const min_x = Math.max(a.min_x, b.min_x)
  const max_x = Math.min(a.max_x, b.max_x)
  const min_y = Math.max(a.min_y, b.min_y)
  const max_y = Math.min(a.max_y, b.max_y)

  if (min_x >= max_x || min_y >= max_y) return null

  return {
    min_x,
    max_x,
    min_y,
    max_y,
    width: max_x - min_x,
    height: max_y - min_y,
  }
}

const layersIntersect = (a: LayerRef[], b: LayerRef[]): boolean => {
  const bSet = new Set(b)
  return a.some((layer) => bSet.has(layer))
}

const getArea = (bounds: Bounds | null): number => {
  if (!bounds) return Number.POSITIVE_INFINITY
  return bounds.width * bounds.height
}

const toPlacementBounds = (bounds: Bounds): PlacementAreaBounds => ({
  width: bounds.width,
  height: bounds.height,
  min_x: bounds.min_x,
  max_x: bounds.max_x,
  min_y: bounds.min_y,
  max_y: bounds.max_y,
})

const stripNumericSuffix = (name: string): string => {
  const stripped = name.replace(/\d+$/, "")
  return stripped.length >= 2 ? stripped : name
}

const getSummaryLabel = (
  type: PlacementIssueType,
  count: number,
): string | null => {
  if (count === 0) return null

  switch (type) {
    case "pad_overlap":
      return `${count} pad overlap${count === 1 ? "" : "s"}`
    case "off_board":
      return `${count} off-board`
    case "courtyard_collision":
      return `${count} courtyard collision${count === 1 ? "" : "s"}`
    case "connector_body_intrusion":
      return `${count} connector-body intrusion${count === 1 ? "" : "s"}`
    case "footprint_intrusion":
      return `${count} footprint intrusion${count === 1 ? "" : "s"}`
    case "suboptimal_orientation":
      if (count === 1) return "1 suboptimal orientation"
      return `${count} suboptimal orientations`
  }
}

const getMoveDirectionForEdge = (
  edge: ComponentBoardEdgeStatus["edge"],
): "left" | "right" | "up" | "down" => {
  switch (edge) {
    case "left":
      return "right"
    case "right":
      return "left"
    case "top":
      return "down"
    case "bottom":
      return "up"
  }
}

const getBoardEdgeStatus = (
  bounds: Bounds | null,
  boardBounds: Bounds | null,
  componentName: string,
): ComponentBoardEdgeStatus | null => {
  if (!bounds || !boardBounds) return null

  const clearances = [
    { edge: "left" as const, clearance: bounds.min_x - boardBounds.min_x },
    { edge: "right" as const, clearance: boardBounds.max_x - bounds.max_x },
    { edge: "top" as const, clearance: bounds.min_y - boardBounds.min_y },
    {
      edge: "bottom" as const,
      clearance: boardBounds.max_y - bounds.max_y,
    },
  ]

  const outside = clearances
    .filter((entry) => entry.clearance < 0)
    .sort((a, b) => a.clearance - b.clearance)

  const selected =
    outside[0] ??
    [...clearances].sort((a, b) => a.clearance - b.clearance)[0] ??
    null

  if (!selected) return null

  return {
    component_name: componentName,
    edge: selected.edge,
    status: selected.clearance < 0 ? "outside" : "inside",
    distance: Math.abs(selected.clearance),
  }
}

const formatBoardEdgeStatus = (status: ComponentBoardEdgeStatus): string =>
  `${fmtMm(status.distance)} ${status.status} ${status.edge} edge`

const chooseMover = (
  a: ComponentContext,
  b: ComponentContext,
  preferredMover?: string,
): { mover: ComponentContext; anchor: ComponentContext } => {
  if (preferredMover === a.name) return { mover: a, anchor: b }
  if (preferredMover === b.name) return { mover: b, anchor: a }

  if (a.isConnectorLike && !b.isConnectorLike) return { mover: b, anchor: a }
  if (b.isConnectorLike && !a.isConnectorLike) return { mover: a, anchor: b }

  const areaA = getArea(a.bounds)
  const areaB = getArea(b.bounds)

  if (areaA < areaB) return { mover: a, anchor: b }
  if (areaB < areaA) return { mover: b, anchor: a }

  return a.order > b.order ? { mover: a, anchor: b } : { mover: b, anchor: a }
}

const getMoveDirectionBetweenComponents = (
  mover: ComponentContext,
  anchor: ComponentContext,
  axis: "x" | "y",
): "left" | "right" | "up" | "down" => {
  if (axis === "x") {
    if ((mover.centerX ?? 0) >= (anchor.centerX ?? 0)) return "right"
    return "left"
  }

  if ((mover.centerY ?? 0) >= (anchor.centerY ?? 0)) return "down"
  return "up"
}

const getSeparationSuggestion = (
  a: ComponentContext,
  b: ComponentContext,
  overlapX: number,
  overlapY: number,
  preferredMover?: string,
): string | undefined => {
  if (
    a.centerX === null ||
    a.centerY === null ||
    b.centerX === null ||
    b.centerY === null
  ) {
    return undefined
  }

  const { mover, anchor } = chooseMover(a, b, preferredMover)
  const axis = overlapX <= overlapY ? "x" : "y"
  const distance = axis === "x" ? overlapX : overlapY
  const direction = getMoveDirectionBetweenComponents(mover, anchor, axis)

  return `move ${mover.name} ${fmtMm(distance)} ${direction}`
}

const getCountainmentBonus = (
  a: ComponentContext,
  b: ComponentContext,
): number => {
  if (!a.bounds || !b.bounds || a.centerX === null || a.centerY === null)
    return 0

  const centerInsideB =
    a.centerX >= b.bounds.min_x &&
    a.centerX <= b.bounds.max_x &&
    a.centerY >= b.bounds.min_y &&
    a.centerY <= b.bounds.max_y

  return centerInsideB ? 25 : 0
}

const createIssue = (issue: PlacementIssue): PlacementIssue => issue

const getComponentNameFromSourceId = (
  sourceComponentsById: Map<string, ComponentContext>,
  sourceComponentId: unknown,
): ComponentContext | null => {
  if (typeof sourceComponentId !== "string") return null
  return sourceComponentsById.get(sourceComponentId) ?? null
}

const getComponentByPcbId = (
  componentsByPcbId: Map<string, ComponentContext>,
  pcbComponentId: unknown,
): ComponentContext | null => {
  if (typeof pcbComponentId !== "string") return null
  return componentsByPcbId.get(pcbComponentId) ?? null
}

const getLayers = (value: unknown): LayerRef[] => {
  if (!Array.isArray(value)) return []
  return value.filter((layer): layer is LayerRef => typeof layer === "string")
}

const getBoardSideFromShape = (shape: PhysicalShape): BoardSide | null => {
  const hasTop = shape.layers.includes("top")
  const hasBottom = shape.layers.includes("bottom")

  if (hasTop === hasBottom) return null
  return hasTop ? "top" : "bottom"
}

const getComponentSide = (component: ComponentContext): BoardSide | null => {
  if (isBoardSide(component.layer)) return component.layer

  let inferredSide: BoardSide | null = null

  for (const shape of [...component.courtyards, ...component.pads]) {
    const side = getBoardSideFromShape(shape)
    if (!side) continue
    if (inferredSide && inferredSide !== side) return null
    inferredSide = side
  }

  return inferredSide
}

const buildComponentContexts = (
  circuitJson: CircuitElement[],
): {
  components: ComponentContext[]
  componentByName: Map<string, ComponentContext>
  boardBounds: Bounds | null
} => {
  const components: ComponentContext[] = []
  const sourceComponentsById = new Map<string, ComponentContext>()
  const componentByName = new Map<string, ComponentContext>()
  const componentsByPcbId = new Map<string, ComponentContext>()

  let order = 0

  for (const el of circuitJson) {
    if (
      el.type !== "source_component" ||
      typeof el.source_component_id !== "string" ||
      typeof el.name !== "string"
    ) {
      continue
    }

    if (componentByName.has(el.name)) continue

    const context: ComponentContext = {
      name: el.name,
      sourceComponent: el,
      sourceComponentId: el.source_component_id,
      pcbComponent: null,
      pcbComponentId: null,
      centerX: null,
      centerY: null,
      layer: null,
      width: null,
      height: null,
      bounds: null,
      anchorAlignment: CENTER_ANCHOR,
      placementMode: "none",
      pads: [],
      courtyards: [],
      isConnectorLike: false,
      order: order++,
    }

    const xDefinitionRaw = el.pcbX ?? el.pcb_x ?? el.x
    const yDefinitionRaw = el.pcbY ?? el.pcb_y ?? el.y

    context.xDefinition =
      xDefinitionRaw === undefined ? undefined : String(xDefinitionRaw)
    context.yDefinition =
      yDefinitionRaw === undefined ? undefined : String(yDefinitionRaw)

    if (
      context.xDefinition !== undefined ||
      context.yDefinition !== undefined
    ) {
      context.placementMode = "props_set"
    } else if (el.placement_mode === "auto") {
      context.placementMode = "auto"
    }

    components.push(context)
    sourceComponentsById.set(context.sourceComponentId, context)
    componentByName.set(context.name, context)
  }

  for (const el of circuitJson) {
    if (
      el.type !== "pcb_component" ||
      typeof el.source_component_id !== "string" ||
      typeof el.pcb_component_id !== "string"
    ) {
      continue
    }

    const context = sourceComponentsById.get(el.source_component_id)
    if (!context) continue

    context.pcbComponent = el
    context.pcbComponentId = el.pcb_component_id
    componentsByPcbId.set(el.pcb_component_id, context)

    const center =
      typeof el.center === "object" && el.center
        ? (el.center as { x?: unknown; y?: unknown })
        : null

    context.centerX = center ? toNumber(center.x) : null
    context.centerY = center ? toNumber(center.y) : null
    context.layer = getLayer(el.layer)
    context.width = toNumber(el.width)
    context.height = toNumber(el.height)

    if (
      context.centerX !== null &&
      context.centerY !== null &&
      context.width !== null &&
      context.height !== null
    ) {
      context.bounds = getBoundsFromCenterAndSize(
        context.centerX,
        context.centerY,
        context.width,
        context.height,
      )
    }

    if (context.placementMode === "none" && el.position_mode === "auto") {
      context.placementMode = "auto"
    }

    if (
      context.sourceComponent.ftype === "simple_pin_header" &&
      context.width !== null &&
      context.height !== null
    ) {
      context.orientation =
        context.width >= context.height ? "horizontal" : "vertical"
    }
  }

  for (const el of circuitJson) {
    if (
      el.type === "pcb_silkscreen_text" &&
      typeof el.anchor_alignment === "string"
    ) {
      const context = getComponentByPcbId(
        componentsByPcbId,
        el.pcb_component_id,
      )
      if (!context) continue
      context.anchorAlignment = el.anchor_alignment as NinePointAnchor
      continue
    }

    if (el.type === "pcb_smtpad") {
      const context = getComponentByPcbId(
        componentsByPcbId,
        el.pcb_component_id,
      )
      if (!context) continue

      const x = toNumber(el.x)
      const y = toNumber(el.y)
      const width = toNumber(el.width)
      const height = toNumber(el.height)
      const layer = getLayer(el.layer)

      if (
        x === null ||
        y === null ||
        width === null ||
        height === null ||
        !layer
      )
        continue

      context.pads.push({
        bounds: getBoundsFromCenterAndSize(x, y, width, height),
        layers: [layer],
      })
      continue
    }

    if (el.type === "pcb_plated_hole") {
      const context = getComponentByPcbId(
        componentsByPcbId,
        el.pcb_component_id,
      )
      if (!context) continue

      const x = toNumber(el.x)
      const y = toNumber(el.y)
      const layers = getLayers(el.layers)
      if (x === null || y === null || layers.length === 0) continue

      let width: number | null = null
      let height: number | null = null

      if (el.shape === "circle") {
        const diameter =
          toNumber(el.outer_diameter) ?? toNumber(el.hole_diameter)
        width = diameter
        height = diameter
      } else if (
        el.shape === "circular_hole_with_rect_pad" ||
        el.shape === "pill_hole_with_rect_pad" ||
        el.shape === "rotated_pill_hole_with_rect_pad"
      ) {
        width = toNumber(el.rect_pad_width)
        height = toNumber(el.rect_pad_height)
      } else if (el.shape === "hole_with_polygon_pad") {
        const padOutline = Array.isArray(el.pad_outline)
          ? (el.pad_outline as Array<{ x?: unknown; y?: unknown }>)
          : []
        const padBounds = getBoundsFromPoints(
          padOutline.map((point) => ({
            x: (toNumber(point.x) ?? 0) + x,
            y: (toNumber(point.y) ?? 0) + y,
          })),
        )

        if (padBounds) {
          context.pads.push({
            bounds: padBounds,
            layers,
          })
        }
        continue
      }

      if (width === null || height === null) continue

      context.pads.push({
        bounds: getBoundsFromCenterAndSize(x, y, width, height),
        layers,
      })
      continue
    }

    if (el.type === "pcb_courtyard_circle") {
      const context = getComponentByPcbId(
        componentsByPcbId,
        el.pcb_component_id,
      )
      if (!context) continue

      if (!el.center || typeof el.center !== "object") continue
      const center = el.center as { x?: unknown; y?: unknown }
      const x = toNumber(center.x)
      const y = toNumber(center.y)
      if (x === null || y === null) continue

      const radius = toNumber(el.radius)
      if (radius === null || radius <= 0) continue

      const layer = getLayer(el.layer) ?? context.layer
      const layers: LayerRef[] = []
      if (layer) layers.push(layer)

      context.courtyards.push({
        bounds: getBoundsFromCenterAndSize(x, y, radius * 2, radius * 2),
        layers,
        circle: { x, y, radius },
      })
      continue
    }

    if (el.type === "pcb_courtyard_rect") {
      const context = getComponentByPcbId(
        componentsByPcbId,
        el.pcb_component_id,
      )
      if (!context) continue

      const center =
        typeof el.center === "object" && el.center
          ? (el.center as { x?: unknown; y?: unknown })
          : null
      const centerX = center ? toNumber(center.x) : null
      const centerY = center ? toNumber(center.y) : null
      const width = toNumber(el.width)
      const height = toNumber(el.height)
      const ccwRotation = toNumber(el.ccw_rotation) ?? 0

      if (
        centerX === null ||
        centerY === null ||
        width === null ||
        height === null
      )
        continue

      const layer = getLayer(el.layer) ?? context.layer
      context.courtyards.push({
        bounds: getBoundsFromRotatedCenterAndSize(
          centerX,
          centerY,
          width,
          height,
          ccwRotation,
        ),
        layers: layer ? [layer] : [],
        orientedRect: { x: centerX, y: centerY, width, height, ccwRotation },
      })
      continue
    }

    if (el.type === "pcb_courtyard_outline") {
      const context = getComponentByPcbId(
        componentsByPcbId,
        el.pcb_component_id,
      )
      if (!context) continue
      const outline = Array.isArray(el.outline)
        ? (el.outline as Array<{ x?: unknown; y?: unknown }>)
        : []
      const bounds = getBoundsFromPoints(outline)
      const layer = getLayer(el.layer) ?? context.layer
      if (bounds) {
        context.courtyards.push({
          bounds,
          layers: layer ? [layer] : [],
        })
      }
      continue
    }

    if (el.type === "pcb_courtyard_polygon") {
      const context = getComponentByPcbId(
        componentsByPcbId,
        el.pcb_component_id,
      )
      if (!context) continue
      const points = Array.isArray(el.points)
        ? (el.points as Array<{ x?: unknown; y?: unknown }>)
        : []
      const bounds = getBoundsFromPoints(points)
      const layer = getLayer(el.layer) ?? context.layer
      if (bounds) {
        context.courtyards.push({
          bounds,
          layers: layer ? [layer] : [],
        })
      }
    }
  }

  for (const context of components) {
    const nameUpper = context.name.toUpperCase()
    const ftype = String(context.sourceComponent.ftype ?? "").toUpperCase()
    const manufacturerPartNumber = String(
      context.sourceComponent.manufacturer_part_number ??
        context.sourceComponent.manufacturerPartNumber ??
        "",
    ).toUpperCase()
    const platedHoleCount = context.pads.filter((pad) =>
      pad.layers.includes("bottom"),
    ).length

    context.isConnectorLike =
      ftype === "SIMPLE_PIN_HEADER" ||
      nameUpper.startsWith("USB") ||
      /^J[A-Z0-9_]*\d*$/.test(nameUpper) ||
      /USB|CONN|CONNECTOR|HEADER|SOCKET|JST|HDMI|RJ|BARREL/.test(
        manufacturerPartNumber,
      ) ||
      (platedHoleCount >= 4 &&
        context.bounds !== null &&
        Math.max(context.bounds.width, context.bounds.height) >= 4)
  }

  const pcbBoard = circuitJson.find((el) => el.type === "pcb_board")
  const boardCenter =
    pcbBoard && typeof pcbBoard.center === "object" && pcbBoard.center
      ? (pcbBoard.center as { x?: unknown; y?: unknown })
      : null
  const boardCenterX = boardCenter ? toNumber(boardCenter.x) : null
  const boardCenterY = boardCenter ? toNumber(boardCenter.y) : null
  const boardWidth = toNumber(pcbBoard?.width)
  const boardHeight = toNumber(pcbBoard?.height)

  const boardBounds =
    boardCenterX !== null &&
    boardCenterY !== null &&
    boardWidth !== null &&
    boardHeight !== null
      ? getBoundsFromCenterAndSize(
          boardCenterX,
          boardCenterY,
          boardWidth,
          boardHeight,
        )
      : null

  return {
    components,
    componentByName,
    boardBounds,
  }
}

const getTopCopperBounds = (component: ComponentContext): Bounds | null => {
  const topPadBounds = component.pads
    .filter((pad) => pad.layers.includes("top"))
    .map((pad) => pad.bounds)

  if (topPadBounds.length === 0) return null

  return {
    min_x: Math.min(...topPadBounds.map((bounds) => bounds.min_x)),
    max_x: Math.max(...topPadBounds.map((bounds) => bounds.max_x)),
    min_y: Math.min(...topPadBounds.map((bounds) => bounds.min_y)),
    max_y: Math.max(...topPadBounds.map((bounds) => bounds.max_y)),
    width:
      Math.max(...topPadBounds.map((bounds) => bounds.max_x)) -
      Math.min(...topPadBounds.map((bounds) => bounds.min_x)),
    height:
      Math.max(...topPadBounds.map((bounds) => bounds.max_y)) -
      Math.min(...topPadBounds.map((bounds) => bounds.min_y)),
  }
}

const getTopOccupancyBounds = (component: ComponentContext): Bounds[] => {
  if (getComponentSide(component) !== "top") return []

  const topCourtyards = component.courtyards
    .filter((courtyard) => courtyard.layers.includes("top"))
    .map((courtyard) => courtyard.bounds)
  if (topCourtyards.length > 0) return topCourtyards

  const topCopperBounds = getTopCopperBounds(component)
  return topCopperBounds ? [topCopperBounds] : []
}

const getUniqueSortedCoordinates = (values: number[]): number[] =>
  [...new Set(values)].sort((a, b) => a - b)

type EmptySpaceIndexItem = PlacementEmptySpace & {
  id: string
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const createBounds = (
  min_x: number,
  max_x: number,
  min_y: number,
  max_y: number,
): Bounds => ({
  min_x,
  max_x,
  min_y,
  max_y,
  width: max_x - min_x,
  height: max_y - min_y,
})

const pointIsInsideBounds = (x: number, y: number, bounds: Bounds): boolean =>
  x > bounds.min_x + GEOMETRY_EPSILON &&
  x < bounds.max_x - GEOMETRY_EPSILON &&
  y > bounds.min_y + GEOMETRY_EPSILON &&
  y < bounds.max_y - GEOMETRY_EPSILON

const buildFlatbushIndex = (boundsList: Bounds[]): Flatbush | null => {
  if (boundsList.length === 0) return null

  const index = new Flatbush(boundsList.length)
  for (const bounds of boundsList) {
    index.add(bounds.min_x, bounds.min_y, bounds.max_x, bounds.max_y)
  }
  index.finish()
  return index
}

const boundsOverlapWithArea = (a: Bounds, b: Bounds): boolean =>
  getBoundsIntersection(a, b) !== null

const isBoundsEmpty = (
  bounds: Bounds,
  occupiedBounds: Bounds[],
  occupiedIndex: Flatbush | null,
): boolean => {
  if (bounds.width <= GEOMETRY_EPSILON || bounds.height <= GEOMETRY_EPSILON) {
    return true
  }

  const candidates = occupiedIndex
    ? occupiedIndex.search(
        bounds.min_x,
        bounds.min_y,
        bounds.max_x,
        bounds.max_y,
      )
    : occupiedBounds.map((_, index) => index)

  return !candidates.some((candidateIndex) =>
    boundsOverlapWithArea(bounds, occupiedBounds[candidateIndex]!),
  )
}

const isPointOccupied = (
  x: number,
  y: number,
  occupiedBounds: Bounds[],
  occupiedIndex: Flatbush | null,
): boolean => {
  const candidates = occupiedIndex
    ? occupiedIndex.search(x, y, x, y)
    : occupiedBounds.map((_, index) => index)

  return candidates.some((candidateIndex) =>
    pointIsInsideBounds(x, y, occupiedBounds[candidateIndex]!),
  )
}

const getSampleAxisValues = (
  min: number,
  max: number,
  step: number,
): number[] => {
  const values = new Set<number>([min, max])

  let current = min
  while (current < max - GEOMETRY_EPSILON) {
    const next = Math.min(current + step, max)
    values.add(current)
    values.add((current + next) / 2)
    values.add(next)
    current = next
  }

  return [...values].sort((a, b) => a - b)
}

const getExpansionDelta = (
  bounds: Bounds,
  boardBounds: Bounds,
  direction: "left" | "right" | "up" | "down",
  occupiedBounds: Bounds[],
  occupiedIndex: Flatbush | null,
): number => {
  const searchIndices = (() => {
    switch (direction) {
      case "left":
        return occupiedIndex
          ? occupiedIndex.search(
              boardBounds.min_x,
              bounds.min_y,
              bounds.min_x,
              bounds.max_y,
            )
          : occupiedBounds.map((_, index) => index)
      case "right":
        return occupiedIndex
          ? occupiedIndex.search(
              bounds.max_x,
              bounds.min_y,
              boardBounds.max_x,
              bounds.max_y,
            )
          : occupiedBounds.map((_, index) => index)
      case "up":
        return occupiedIndex
          ? occupiedIndex.search(
              bounds.min_x,
              boardBounds.min_y,
              bounds.max_x,
              bounds.min_y,
            )
          : occupiedBounds.map((_, index) => index)
      case "down":
        return occupiedIndex
          ? occupiedIndex.search(
              bounds.min_x,
              bounds.max_y,
              bounds.max_x,
              boardBounds.max_y,
            )
          : occupiedBounds.map((_, index) => index)
    }
  })()

  const overlappingCandidates = searchIndices
    .map((index) => occupiedBounds[index]!)
    .filter((candidate) => {
      if (direction === "left" || direction === "right") {
        return (
          Math.min(bounds.max_y, candidate.max_y) -
            Math.max(bounds.min_y, candidate.min_y) >
          GEOMETRY_EPSILON
        )
      }

      return (
        Math.min(bounds.max_x, candidate.max_x) -
          Math.max(bounds.min_x, candidate.min_x) >
        GEOMETRY_EPSILON
      )
    })

  switch (direction) {
    case "left":
      return Math.max(
        0,
        Math.min(
          bounds.min_x - boardBounds.min_x,
          ...overlappingCandidates
            .filter(
              (candidate) => candidate.max_x <= bounds.min_x + GEOMETRY_EPSILON,
            )
            .map((candidate) => bounds.min_x - candidate.max_x),
        ),
      )
    case "right":
      return Math.max(
        0,
        Math.min(
          boardBounds.max_x - bounds.max_x,
          ...overlappingCandidates
            .filter(
              (candidate) => candidate.min_x >= bounds.max_x - GEOMETRY_EPSILON,
            )
            .map((candidate) => candidate.min_x - bounds.max_x),
        ),
      )
    case "up":
      return Math.max(
        0,
        Math.min(
          bounds.min_y - boardBounds.min_y,
          ...overlappingCandidates
            .filter(
              (candidate) => candidate.max_y <= bounds.min_y + GEOMETRY_EPSILON,
            )
            .map((candidate) => bounds.min_y - candidate.max_y),
        ),
      )
    case "down":
      return Math.max(
        0,
        Math.min(
          boardBounds.max_y - bounds.max_y,
          ...overlappingCandidates
            .filter(
              (candidate) => candidate.min_y >= bounds.max_y - GEOMETRY_EPSILON,
            )
            .map((candidate) => candidate.min_y - bounds.max_y),
        ),
      )
  }
}

const expandBounds = (
  bounds: Bounds,
  direction: "left" | "right" | "up" | "down",
  delta: number,
): Bounds => {
  switch (direction) {
    case "left":
      return createBounds(
        bounds.min_x - delta,
        bounds.max_x,
        bounds.min_y,
        bounds.max_y,
      )
    case "right":
      return createBounds(
        bounds.min_x,
        bounds.max_x + delta,
        bounds.min_y,
        bounds.max_y,
      )
    case "up":
      return createBounds(
        bounds.min_x,
        bounds.max_x,
        bounds.min_y - delta,
        bounds.max_y,
      )
    case "down":
      return createBounds(
        bounds.min_x,
        bounds.max_x,
        bounds.min_y,
        bounds.max_y + delta,
      )
  }
}

const growBoundsInDirection = (
  initialBounds: Bounds,
  boardBounds: Bounds,
  occupiedBounds: Bounds[],
  occupiedIndex: Flatbush | null,
  direction: "left" | "right" | "up" | "down",
): Bounds => {
  const delta = getExpansionDelta(
    initialBounds,
    boardBounds,
    direction,
    occupiedBounds,
    occupiedIndex,
  )
  if (delta <= GEOMETRY_EPSILON) return initialBounds

  const nextBounds = expandBounds(initialBounds, direction, delta)
  return isBoundsEmpty(nextBounds, occupiedBounds, occupiedIndex)
    ? nextBounds
    : initialBounds
}

const growRectangleFully = (
  initialBounds: Bounds,
  boardBounds: Bounds,
  occupiedBounds: Bounds[],
  occupiedIndex: Flatbush | null,
): Bounds => {
  let currentBounds = initialBounds

  while (true) {
    const candidates = (["left", "right", "up", "down"] as const)
      .map((direction) => {
        const delta = getExpansionDelta(
          currentBounds,
          boardBounds,
          direction,
          occupiedBounds,
          occupiedIndex,
        )
        if (delta <= GEOMETRY_EPSILON) return null
        const nextBounds = expandBounds(currentBounds, direction, delta)
        if (!isBoundsEmpty(nextBounds, occupiedBounds, occupiedIndex))
          return null
        return {
          direction,
          bounds: nextBounds,
          area: nextBounds.width * nextBounds.height,
        }
      })
      .filter(
        (
          candidate,
        ): candidate is {
          direction: "left" | "right" | "up" | "down"
          bounds: Bounds
          area: number
        } => Boolean(candidate),
      )
      .sort((a, b) => {
        if (b.area !== a.area) return b.area - a.area
        return a.direction.localeCompare(b.direction)
      })

    const bestCandidate = candidates[0]
    if (!bestCandidate) return currentBounds

    currentBounds = bestCandidate.bounds
  }
}

const getLargestEmptySpaceFromPoint = (
  x: number,
  y: number,
  boardBounds: Bounds,
  occupiedBounds: Bounds[],
  occupiedIndex: Flatbush | null,
): Bounds | null => {
  if (isPointOccupied(x, y, occupiedBounds, occupiedIndex)) return null

  const horizontalSpan = (["left", "right"] as const).reduce(
    (bounds, direction) =>
      growBoundsInDirection(
        bounds,
        boardBounds,
        occupiedBounds,
        occupiedIndex,
        direction,
      ),
    createBounds(x, x, y - GEOMETRY_EPSILON, y + GEOMETRY_EPSILON),
  )

  const verticalSpan = (["up", "down"] as const).reduce(
    (bounds, direction) =>
      growBoundsInDirection(
        bounds,
        boardBounds,
        occupiedBounds,
        occupiedIndex,
        direction,
      ),
    createBounds(x - GEOMETRY_EPSILON, x + GEOMETRY_EPSILON, y, y),
  )

  const horizontalFirst = growRectangleFully(
    (["up", "down"] as const).reduce(
      (bounds, direction) =>
        growBoundsInDirection(
          bounds,
          boardBounds,
          occupiedBounds,
          occupiedIndex,
          direction,
        ),
      horizontalSpan,
    ),
    boardBounds,
    occupiedBounds,
    occupiedIndex,
  )

  const verticalFirst = growRectangleFully(
    (["left", "right"] as const).reduce(
      (bounds, direction) =>
        growBoundsInDirection(
          bounds,
          boardBounds,
          occupiedBounds,
          occupiedIndex,
          direction,
        ),
      verticalSpan,
    ),
    boardBounds,
    occupiedBounds,
    occupiedIndex,
  )

  const horizontalArea = horizontalFirst.width * horizontalFirst.height
  const verticalArea = verticalFirst.width * verticalFirst.height

  if (horizontalArea <= GEOMETRY_EPSILON && verticalArea <= GEOMETRY_EPSILON) {
    return null
  }

  return horizontalArea >= verticalArea ? horizontalFirst : verticalFirst
}

const createEmptySpaceIndexItem = (
  bounds: Bounds,
  boardArea: number,
  sequenceNumber: number,
): EmptySpaceIndexItem => {
  const area = bounds.width * bounds.height
  return {
    id: `empty-space-${sequenceNumber}`,
    minX: bounds.min_x,
    minY: bounds.min_y,
    maxX: bounds.max_x,
    maxY: bounds.max_y,
    area,
    areaPercent: boardArea === 0 ? 0 : (area / boardArea) * 100,
    bounds: toPlacementBounds(bounds),
  }
}

const buildLargeEmptySpaces = (
  boardBounds: Bounds,
  occupiedBounds: Bounds[],
  occupiedIndex: Flatbush | null,
  boardArea: number,
  thresholdArea: number,
): PlacementEmptySpace[] => {
  const emptySpaceIndex = new RBush<EmptySpaceIndexItem>()
  const sampleXs = getSampleAxisValues(
    boardBounds.min_x,
    boardBounds.max_x,
    EMPTY_SPACE_SAMPLE_STEP_MM,
  )
  const sampleYs = getSampleAxisValues(
    boardBounds.min_y,
    boardBounds.max_y,
    EMPTY_SPACE_SAMPLE_STEP_MM,
  )

  let sequenceNumber = 0

  for (const y of sampleYs) {
    for (const x of sampleXs) {
      const bounds = getLargestEmptySpaceFromPoint(
        x,
        y,
        boardBounds,
        occupiedBounds,
        occupiedIndex,
      )

      if (!bounds) continue

      const area = bounds.width * bounds.height
      if (area <= thresholdArea) continue

      const candidate = createEmptySpaceIndexItem(
        bounds,
        boardArea,
        sequenceNumber++,
      )
      const overlappingSpaces = emptySpaceIndex
        .search(candidate)
        .filter((space) =>
          boundsOverlapWithArea(
            bounds,
            createBounds(space.minX, space.maxX, space.minY, space.maxY),
          ),
        )

      if (overlappingSpaces.some((space) => space.area >= candidate.area)) {
        continue
      }

      for (const overlappingSpace of overlappingSpaces) {
        emptySpaceIndex.remove(overlappingSpace)
      }

      emptySpaceIndex.insert(candidate)
    }
  }

  return emptySpaceIndex
    .all()
    .map(({ area, areaPercent, bounds }) => ({
      area,
      areaPercent,
      bounds,
    }))
    .sort((a, b) => {
      if (b.area !== a.area) return b.area - a.area
      if (a.bounds.min_y !== b.bounds.min_y) {
        return a.bounds.min_y - b.bounds.min_y
      }
      return a.bounds.min_x - b.bounds.min_x
    })
}

const buildBoardTopLayerReport = (
  components: ComponentContext[],
  boardBounds: Bounds | null,
): PlacementBoardTopLayerReport | null => {
  if (!boardBounds) return null

  const boardArea = boardBounds.width * boardBounds.height
  const largeEmptySpaceThresholdArea =
    boardArea * LARGE_EMPTY_SPACE_THRESHOLD_RATIO

  const occupancyBounds = components.flatMap((component) =>
    getTopOccupancyBounds(component)
      .map((bounds) => getBoundsIntersection(bounds, boardBounds))
      .filter((bounds): bounds is Bounds => Boolean(bounds)),
  )
  const occupiedIndex = buildFlatbushIndex(occupancyBounds)

  const xCoords = getUniqueSortedCoordinates([
    boardBounds.min_x,
    boardBounds.max_x,
    ...occupancyBounds.flatMap((bounds) => [bounds.min_x, bounds.max_x]),
  ])
  const yCoords = getUniqueSortedCoordinates([
    boardBounds.min_y,
    boardBounds.max_y,
    ...occupancyBounds.flatMap((bounds) => [bounds.min_y, bounds.max_y]),
  ])

  const occupied: boolean[][] = []
  let occupiedArea = 0

  for (let yi = 0; yi < yCoords.length - 1; yi += 1) {
    const row: boolean[] = []

    for (let xi = 0; xi < xCoords.length - 1; xi += 1) {
      const cellBounds: Bounds = {
        min_x: xCoords[xi]!,
        max_x: xCoords[xi + 1]!,
        min_y: yCoords[yi]!,
        max_y: yCoords[yi + 1]!,
        width: xCoords[xi + 1]! - xCoords[xi]!,
        height: yCoords[yi + 1]! - yCoords[yi]!,
      }

      const candidateIndices = occupiedIndex
        ? occupiedIndex.search(
            cellBounds.min_x,
            cellBounds.min_y,
            cellBounds.max_x,
            cellBounds.max_y,
          )
        : occupancyBounds.map((_, index) => index)
      const isOccupied = candidateIndices.some((candidateIndex) =>
        boundsOverlapWithArea(cellBounds, occupancyBounds[candidateIndex]!),
      )

      row.push(isOccupied)
      if (isOccupied) occupiedArea += cellBounds.width * cellBounds.height
    }

    occupied.push(row)
  }

  const largeEmptySpaces = buildLargeEmptySpaces(
    boardBounds,
    occupancyBounds,
    occupiedIndex,
    boardArea,
    largeEmptySpaceThresholdArea,
  )

  return {
    boardArea,
    occupiedArea,
    utilizationPercent: boardArea === 0 ? 0 : (occupiedArea / boardArea) * 100,
    largeEmptySpaceThresholdArea,
    largeEmptySpaces,
  }
}

type PcbPortIndexes = {
  pcbPortBySourcePortId: Map<SourcePortId, PcbPort>
  pcbPortsBySourceComponentId: Map<SourceComponentId, PcbPort[]>
  sourceComponentIdBySourcePortId: Map<SourcePortId, SourceComponentId>
}

const buildDirectlyConnectedSourcePortIdsBySourcePortId = (
  circuitJson: CircuitElement[],
): Map<SourcePortId, Set<SourcePortId>> => {
  const directlyConnectedSourcePortIdsBySourcePortId = new Map<
    SourcePortId,
    Set<SourcePortId>
  >()

  for (const element of circuitJson) {
    if (element.type !== "source_trace") continue
    if (!Array.isArray(element.connected_source_port_ids)) continue

    const connectedSourcePortIds = element.connected_source_port_ids.filter(
      (sourcePortId): sourcePortId is SourcePortId =>
        typeof sourcePortId === "string",
    )
    if (connectedSourcePortIds.length !== 2) continue

    if (Array.isArray(element.connected_source_net_ids)) {
      const connectedSourceNetIds = element.connected_source_net_ids.filter(
        (sourceNetId) => typeof sourceNetId === "string",
      )
      if (connectedSourceNetIds.length !== 0) continue
    }

    const [firstSourcePortId, secondSourcePortId] = connectedSourcePortIds
    if (!firstSourcePortId || !secondSourcePortId) continue

    const connectedSourcePortPairs: [SourcePortId, SourcePortId][] = [
      [firstSourcePortId, secondSourcePortId],
      [secondSourcePortId, firstSourcePortId],
    ]

    for (const [
      sourcePortId,
      connectedSourcePortId,
    ] of connectedSourcePortPairs) {
      let directlyConnectedSourcePortIds =
        directlyConnectedSourcePortIdsBySourcePortId.get(sourcePortId)
      if (!directlyConnectedSourcePortIds) {
        directlyConnectedSourcePortIds = new Set<SourcePortId>()
        directlyConnectedSourcePortIdsBySourcePortId.set(
          sourcePortId,
          directlyConnectedSourcePortIds,
        )
      }
      directlyConnectedSourcePortIds.add(connectedSourcePortId)
    }
  }

  return directlyConnectedSourcePortIdsBySourcePortId
}

const buildPcbPortIndexes = (circuitJson: CircuitElement[]): PcbPortIndexes => {
  const sourceComponentIdBySourcePortId = new Map<
    SourcePortId,
    SourceComponentId
  >()
  const pcbPortBySourcePortId = new Map<SourcePortId, PcbPort>()
  const pcbPortsBySourceComponentId = new Map<SourceComponentId, PcbPort[]>()

  for (const element of circuitJson) {
    if (
      element.type === "source_port" &&
      typeof element.source_port_id === "string" &&
      typeof element.source_component_id === "string"
    ) {
      sourceComponentIdBySourcePortId.set(
        element.source_port_id,
        element.source_component_id,
      )
    }
  }

  for (const element of circuitJson) {
    if (!isPcbPort(element)) continue

    const pcbPort = element

    const sourceComponentId = sourceComponentIdBySourcePortId.get(
      pcbPort.source_port_id,
    )
    if (!sourceComponentId) continue

    pcbPortBySourcePortId.set(pcbPort.source_port_id, pcbPort)

    let componentPcbPorts = pcbPortsBySourceComponentId.get(sourceComponentId)
    if (!componentPcbPorts) {
      componentPcbPorts = []
      pcbPortsBySourceComponentId.set(sourceComponentId, componentPcbPorts)
    }
    componentPcbPorts.push(pcbPort)
  }

  return {
    pcbPortBySourcePortId,
    pcbPortsBySourceComponentId,
    sourceComponentIdBySourcePortId,
  }
}

const doesDirectConnectionCrossPadCenterline = ({
  pcbPort,
  connectedPcbPort,
  firstComponentPcbPort,
  secondComponentPcbPort,
}: {
  pcbPort: PcbPort
  connectedPcbPort: PcbPort
  firstComponentPcbPort: PcbPort
  secondComponentPcbPort: PcbPort
}): boolean => {
  const padCenterlineX =
    (firstComponentPcbPort.x + secondComponentPcbPort.x) / 2
  const padCenterlineY =
    (firstComponentPcbPort.y + secondComponentPcbPort.y) / 2
  const padAxisX = secondComponentPcbPort.x - firstComponentPcbPort.x
  const padAxisY = secondComponentPcbPort.y - firstComponentPcbPort.y
  const pcbPortSide =
    (pcbPort.x - padCenterlineX) * padAxisX +
    (pcbPort.y - padCenterlineY) * padAxisY
  const connectedPcbPortSide =
    (connectedPcbPort.x - padCenterlineX) * padAxisX +
    (connectedPcbPort.y - padCenterlineY) * padAxisY

  if (pcbPortSide > GEOMETRY_EPSILON) {
    return connectedPcbPortSide <= GEOMETRY_EPSILON
  }
  if (pcbPortSide < -GEOMETRY_EPSILON) {
    return connectedPcbPortSide >= -GEOMETRY_EPSILON
  }

  return false
}

const buildSuboptimalOrientationIssues = (
  circuitJson: CircuitElement[],
  components: ComponentContext[],
): PlacementIssue[] => {
  const issues: PlacementIssue[] = []
  const pcbPortIndexes = buildPcbPortIndexes(circuitJson)
  const directlyConnectedSourcePortIdsBySourcePortId =
    buildDirectlyConnectedSourcePortIdsBySourcePortId(circuitJson)

  for (const component of components) {
    const componentPcbPorts = pcbPortIndexes.pcbPortsBySourceComponentId.get(
      component.sourceComponentId,
    )
    if (!componentPcbPorts || componentPcbPorts.length !== 2) continue

    const [firstComponentPcbPort, secondComponentPcbPort] = componentPcbPorts
    if (!firstComponentPcbPort || !secondComponentPcbPort) continue

    let crossingConnectionCount = 0

    for (const pcbPort of componentPcbPorts) {
      const directlyConnectedSourcePortIds =
        directlyConnectedSourcePortIdsBySourcePortId.get(pcbPort.source_port_id)
      if (!directlyConnectedSourcePortIds) break
      if (directlyConnectedSourcePortIds.size !== 1) break

      const [connectedSourcePortId] = directlyConnectedSourcePortIds
      if (!connectedSourcePortId) break

      const connectedPcbPort = pcbPortIndexes.pcbPortBySourcePortId.get(
        connectedSourcePortId,
      )
      if (!connectedPcbPort) break

      const connectedSourceComponentId =
        pcbPortIndexes.sourceComponentIdBySourcePortId.get(
          connectedSourcePortId,
        )
      if (connectedSourceComponentId === component.sourceComponentId) break

      const crossesPadCenterline = doesDirectConnectionCrossPadCenterline({
        pcbPort,
        connectedPcbPort,
        firstComponentPcbPort,
        secondComponentPcbPort,
      })
      if (!crossesPadCenterline) break

      crossingConnectionCount += 1
    }

    if (crossingConnectionCount !== 2) continue

    issues.push(
      createIssue({
        type: "suboptimal_orientation",
        componentA: component.name,
        clearance: 0,
        severity: SUBOPTIMAL_ORIENTATION_SEVERITY,
        summary: `${component.name} direct traces cross the routing path between its pads`,
        suggested_move: `rotate ${component.name} 180 degrees`,
      }),
    )
  }

  return issues
}

const buildIssues = ({
  circuitJson,
  components,
  boardBounds,
}: {
  circuitJson: CircuitElement[]
  components: ComponentContext[]
  boardBounds: Bounds | null
}): PlacementIssue[] => {
  const issues: PlacementIssue[] = []

  for (const component of components) {
    const boardEdgeStatus = getBoardEdgeStatus(
      component.bounds,
      boardBounds,
      component.name,
    )
    if (!boardEdgeStatus || boardEdgeStatus.status !== "outside") continue

    const moveDirection = getMoveDirectionForEdge(boardEdgeStatus.edge)
    issues.push(
      createIssue({
        type: "off_board",
        componentA: component.name,
        clearance: -boardEdgeStatus.distance,
        severity: 220 + boardEdgeStatus.distance * 100,
        summary: `${component.name} is ${fmtMm(boardEdgeStatus.distance)} outside ${boardEdgeStatus.edge} edge`,
        suggested_move: `move ${component.name} ${fmtMm(boardEdgeStatus.distance)} ${moveDirection} to clear ${boardEdgeStatus.edge} edge`,
      }),
    )
  }

  for (let i = 0; i < components.length; i += 1) {
    const a = components[i]
    if (!a) continue
    for (let j = i + 1; j < components.length; j += 1) {
      const b = components[j]
      if (!b) continue

      if (!a.bounds || !b.bounds) continue

      const sideA = getComponentSide(a)
      const sideB = getComponentSide(b)
      if (sideA !== null && sideB !== null && sideA !== sideB) continue

      let strongestPadOverlap: {
        overlapX: number
        overlapY: number
        clearance: number
      } | null = null

      for (const padA of a.pads) {
        for (const padB of b.pads) {
          if (!layersIntersect(padA.layers, padB.layers)) continue
          const overlap = getOverlap(padA.bounds, padB.bounds)
          if (!overlap) continue
          if (
            !strongestPadOverlap ||
            overlap.clearance < strongestPadOverlap.clearance
          ) {
            strongestPadOverlap = overlap
          }
        }
      }

      const bodyOverlap = getOverlap(a.bounds, b.bounds)
      let strongestCourtyardOverlap: {
        overlapX: number
        overlapY: number
        clearance: number
      } | null = null

      if (!strongestPadOverlap) {
        for (const courtyardA of a.courtyards) {
          for (const courtyardB of b.courtyards) {
            if (!layersIntersect(courtyardA.layers, courtyardB.layers)) continue
            if (!shapesOverlap(courtyardA, courtyardB)) continue
            // Keep the existing bounds-based clearance and move estimates.
            const overlap = getOverlap(courtyardA.bounds, courtyardB.bounds)
            if (!overlap) continue
            if (
              !strongestCourtyardOverlap ||
              overlap.clearance < strongestCourtyardOverlap.clearance
            ) {
              strongestCourtyardOverlap = overlap
            }
          }
        }
      }

      if (strongestPadOverlap) {
        issues.push(
          createIssue({
            type: "pad_overlap",
            componentA: a.name,
            componentB: b.name,
            clearance: strongestPadOverlap.clearance,
            severity: 300 + Math.abs(strongestPadOverlap.clearance) * 120,
            summary: `${a.name} and ${b.name} pad overlap by ${fmtMm(Math.abs(strongestPadOverlap.clearance))}`,
            suggested_move: getSeparationSuggestion(
              a,
              b,
              strongestPadOverlap.overlapX,
              strongestPadOverlap.overlapY,
            ),
          }),
        )
      }

      if (bodyOverlap) {
        if (a.isConnectorLike || b.isConnectorLike) {
          const connector = a.isConnectorLike ? a : b
          const intruder = connector === a ? b : a
          const overlapX = bodyOverlap.overlapX
          const overlapY = bodyOverlap.overlapY
          const containmentBonus = getCountainmentBonus(intruder, connector)

          issues.push(
            createIssue({
              type: "connector_body_intrusion",
              componentA: intruder.name,
              componentB: connector.name,
              clearance: bodyOverlap.clearance,
              severity:
                260 + Math.abs(bodyOverlap.clearance) * 100 + containmentBonus,
              summary: `${intruder.name} intrudes ${fmtMm(Math.abs(bodyOverlap.clearance))} into ${connector.name} connector body`,
              suggested_move: getSeparationSuggestion(
                a,
                b,
                overlapX,
                overlapY,
                intruder.name,
              ),
            }),
          )
        } else if (!strongestPadOverlap) {
          const containmentBonus =
            getCountainmentBonus(a, b) + getCountainmentBonus(b, a)

          issues.push(
            createIssue({
              type: "footprint_intrusion",
              componentA: a.name,
              componentB: b.name,
              clearance: bodyOverlap.clearance,
              severity:
                180 + Math.abs(bodyOverlap.clearance) * 80 + containmentBonus,
              summary: `${a.name} and ${b.name} footprint intrusion by ${fmtMm(Math.abs(bodyOverlap.clearance))}`,
              suggested_move: getSeparationSuggestion(
                a,
                b,
                bodyOverlap.overlapX,
                bodyOverlap.overlapY,
              ),
            }),
          )
        }
      } else if (strongestCourtyardOverlap) {
        issues.push(
          createIssue({
            type: "courtyard_collision",
            componentA: a.name,
            componentB: b.name,
            clearance: strongestCourtyardOverlap.clearance,
            severity: 120 + Math.abs(strongestCourtyardOverlap.clearance) * 80,
            summary: `${a.name} and ${b.name} courtyard collision by ${fmtMm(Math.abs(strongestCourtyardOverlap.clearance))}`,
            suggested_move: getSeparationSuggestion(
              a,
              b,
              strongestCourtyardOverlap.overlapX,
              strongestCourtyardOverlap.overlapY,
            ),
          }),
        )
      }
    }
  }

  issues.push(...buildSuboptimalOrientationIssues(circuitJson, components))

  return issues.sort((a, b) => b.severity - a.severity)
}

const buildClusters = (
  components: ComponentContext[],
  issues: PlacementIssue[],
): PlacementCluster[] => {
  const componentsByName = new Map(
    components.map((component) => [component.name, component]),
  )
  const adjacency = new Map<string, Set<string>>()
  const incidentSeverity = new Map<string, number>()

  for (const component of components) {
    adjacency.set(component.name, new Set())
    incidentSeverity.set(component.name, 0)
  }

  for (const issue of issues) {
    if (!issue.componentB) continue

    adjacency.get(issue.componentA)?.add(issue.componentB)
    adjacency.get(issue.componentB)?.add(issue.componentA)
    incidentSeverity.set(
      issue.componentA,
      (incidentSeverity.get(issue.componentA) ?? 0) + issue.severity,
    )
    incidentSeverity.set(
      issue.componentB,
      (incidentSeverity.get(issue.componentB) ?? 0) + issue.severity,
    )
  }

  const visited = new Set<string>()
  const clusters: PlacementCluster[] = []

  for (const component of components) {
    if (visited.has(component.name)) continue

    const queue = [component.name]
    const members: string[] = []

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      members.push(current)
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor)
      }
    }

    if (members.length < 3) continue

    const memberSet = new Set(members)
    const severity = issues
      .filter(
        (issue) =>
          issue.componentB &&
          memberSet.has(issue.componentA) &&
          memberSet.has(issue.componentB),
      )
      .reduce((sum, issue) => sum + issue.severity, 0)

    if (severity === 0) continue

    const sortedMembers = [...members].sort((a, b) => {
      const severityA = incidentSeverity.get(a) ?? 0
      const severityB = incidentSeverity.get(b) ?? 0
      if (severityA !== severityB) return severityB - severityA
      const orderA = componentsByName.get(a)?.order ?? 0
      const orderB = componentsByName.get(b)?.order ?? 0
      return orderA - orderB
    })

    const labelComponent =
      sortedMembers.find(
        (name) => componentsByName.get(name)?.isConnectorLike,
      ) ?? sortedMembers[0]

    if (!labelComponent) continue

    clusters.push({
      clusterName: `${stripNumericSuffix(labelComponent)} cluster`,
      componentNames: sortedMembers,
      severity,
    })
  }

  return clusters.sort((a, b) => b.severity - a.severity)
}

const buildCountsByType = (
  issues: PlacementIssue[],
): Partial<Record<PlacementIssueType, number>> => {
  const counts: Partial<Record<PlacementIssueType, number>> = {}

  for (const issue of issues) {
    counts[issue.type] = (counts[issue.type] ?? 0) + 1
  }

  return counts
}

const buildComponentStatuses = (
  components: ComponentContext[],
  boardBounds: Bounds | null,
  issues: PlacementIssue[],
): PlacementComponentStatus[] =>
  components.map((component) => {
    const componentIssues = issues.filter(
      (issue) =>
        issue.componentA === component.name ||
        issue.componentB === component.name,
    )

    return {
      componentName: component.name,
      placementMode: component.placementMode,
      sourcePlacement: {
        xDefinition: component.xDefinition,
        yDefinition: component.yDefinition,
      },
      resolvedPlacement: {
        center:
          component.centerX !== null &&
          component.centerY !== null &&
          (component.layer !== null || getComponentSide(component) !== null)
            ? {
                x: component.centerX,
                y: component.centerY,
                layer: component.layer ?? getComponentSide(component)!,
              }
            : undefined,
        bounds: component.bounds
          ? {
              width: component.bounds.width,
              height: component.bounds.height,
              min_x: component.bounds.min_x,
              max_x: component.bounds.max_x,
              min_y: component.bounds.min_y,
              max_y: component.bounds.max_y,
            }
          : undefined,
        anchorAlignment: component.anchorAlignment,
        orientation: component.orientation,
      },
      boardEdgeStatus: getBoardEdgeStatus(
        component.bounds,
        boardBounds,
        component.name,
      ),
      issues: componentIssues,
    }
  })

const formatSourcePlacement = (component: PlacementComponentStatus): string => {
  const bits: string[] = [`placement_mode=${component.placementMode}`]
  if (component.sourcePlacement.xDefinition !== undefined) {
    bits.push(`x=${component.sourcePlacement.xDefinition}`)
  }
  if (component.sourcePlacement.yDefinition !== undefined) {
    bits.push(`y=${component.sourcePlacement.yDefinition}`)
  }
  return bits.join(", ")
}

const formatBounds = (bounds: PlacementAreaBounds): string =>
  `bounds=(minX=${fmtMm(bounds.min_x)}, maxX=${fmtMm(bounds.max_x)}, minY=${fmtMm(bounds.min_y)}, maxY=${fmtMm(bounds.max_y)})`

const formatResolvedPlacement = (
  component: PlacementComponentStatus,
): string => {
  const bits: string[] = []
  const center = component.resolvedPlacement.center
  const bounds = component.resolvedPlacement.bounds

  if (center) {
    bits.push(
      `center=(${fmtMm(center.x)}, ${fmtMm(center.y)}) on ${center.layer}`,
    )
  }

  if (bounds) {
    bits.push(formatBounds(bounds))
    bits.push(
      `size=(width=${fmtMm(bounds.width)}, height=${fmtMm(bounds.height)})`,
    )
  }

  bits.push(`anchor_alignment="${component.resolvedPlacement.anchorAlignment}"`)

  if (component.resolvedPlacement.orientation) {
    bits.push(`orientation=${component.resolvedPlacement.orientation}`)
  }

  return bits.join("; ")
}

const formatIssue = (issue: PlacementIssue): string => {
  const suffix = issue.suggested_move
    ? ` Suggested move: ${issue.suggested_move}.`
    : ""
  return `${issue.summary}.${suffix}`
}

export const formatPlacementAnalysisReport = (
  report: PlacementAnalysisReport,
): string => {
  const lines: string[] = []
  const summaryBits = ISSUE_TYPE_ORDER.map((type) =>
    getSummaryLabel(type, report.summary.countsByType[type] ?? 0),
  ).filter((entry): entry is string => Boolean(entry))

  lines.push(
    summaryBits.length > 0
      ? `placement summary: ${summaryBits.join(", ")}`
      : "placement summary: no placement issues",
  )

  if (report.summary.topIssues.length > 0) {
    lines.push("")
    lines.push("worst issues:")
    report.summary.topIssues.forEach((issue, index) => {
      lines.push(`${index + 1}. ${formatIssue(issue)}`)
    })
  }

  if (report.summary.likelyBadClusters.length > 0) {
    lines.push("")
    lines.push("likely bad clusters:")
    for (const cluster of report.summary.likelyBadClusters) {
      lines.push(
        `- ${cluster.clusterName}: ${cluster.componentNames.join(", ")}`,
      )
    }
  }

  if (report.boardTopLayer) {
    const emptySpaceThresholdPercent =
      report.boardTopLayer.boardArea === 0
        ? 0
        : (report.boardTopLayer.largeEmptySpaceThresholdArea /
            report.boardTopLayer.boardArea) *
          100

    lines.push("")
    lines.push("board top-layer utilization:")
    lines.push(
      `- occupied: ${fmtPercent(report.boardTopLayer.utilizationPercent)} (${fmtArea(report.boardTopLayer.occupiedArea)} of ${fmtArea(report.boardTopLayer.boardArea)})`,
    )

    if (report.boardTopLayer.largeEmptySpaces.length > 0) {
      lines.push(
        `- empty spaces over ${fmtPercent(emptySpaceThresholdPercent)} of board area:`,
      )
      for (const emptySpace of report.boardTopLayer.largeEmptySpaces) {
        lines.push(
          `  - ${fmtPercent(emptySpace.areaPercent)} (${fmtArea(emptySpace.area)}); ${formatBounds(emptySpace.bounds)}`,
        )
      }
    } else {
      lines.push(
        `- empty spaces over ${fmtPercent(emptySpaceThresholdPercent)} of board area: none`,
      )
    }
  }

  lines.push("")
  lines.push("board-edge status:")
  for (const component of report.components) {
    if (!component.boardEdgeStatus) continue
    lines.push(
      `- ${component.componentName}: ${formatBoardEdgeStatus(component.boardEdgeStatus)}`,
    )
  }

  const flaggedComponents = report.components.filter(
    (component) => component.issues.length > 0,
  )

  if (flaggedComponents.length > 0) {
    lines.push("")
    lines.push("flagged components:")
    for (const component of flaggedComponents) {
      lines.push(`- ${component.componentName}`)
      lines.push(`  source placement: ${formatSourcePlacement(component)}`)
      lines.push(`  resolved placement: ${formatResolvedPlacement(component)}`)
      if (component.boardEdgeStatus) {
        lines.push(
          `  board edge status: ${formatBoardEdgeStatus(component.boardEdgeStatus)}`,
        )
      }
      lines.push("  issues:")
      for (const issue of component.issues) {
        lines.push(`  - ${formatIssue(issue)}`)
      }
    }
  }

  return lines.join("\n")
}

export const buildPlacementAnalysisReport = (
  circuitJson: CircuitElement[],
): PlacementAnalysisReport => {
  const { components, boardBounds } = buildComponentContexts(circuitJson)
  const issues = buildIssues({ circuitJson, components, boardBounds })
  const clusters = buildClusters(components, issues)
  const countsByType = buildCountsByType(issues)
  const boardTopLayer = buildBoardTopLayerReport(components, boardBounds)

  return {
    summary: {
      totalIssueCount: issues.length,
      countsByType,
      topIssues: issues.slice(0, TOP_ISSUE_LIMIT),
      likelyBadClusters: clusters,
    },
    boardTopLayer,
    components: buildComponentStatuses(components, boardBounds, issues),
    issues,
  }
}
