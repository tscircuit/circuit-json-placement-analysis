import "bun-match-svg"
import { expect, test } from "bun:test"
import { analyzeAllPlacements, analyzeComponentPlacement } from "../lib"
import fixture from "./assets/vertical-directions.circuit.json"

const board = (x = 0, y = 0) => ({
  ...fixture[0]!,
  center: { x, y },
})

const component = (name: string, x: number, y: number) => [
  {
    type: "source_component",
    source_component_id: `sc_${name}`,
    name,
    ftype: "simple_resistor",
  },
  {
    type: "pcb_component",
    pcb_component_id: `pc_${name}`,
    source_component_id: `sc_${name}`,
    center: { x, y },
    width: 1,
    height: 2,
    layer: "top",
  },
  {
    type: "pcb_courtyard_rect",
    pcb_courtyard_rect_id: `cr_${name}`,
    pcb_component_id: `pc_${name}`,
    center: { x, y },
    width: 1,
    height: 2,
    layer: "top",
  },
]

// Apply the report's wording using PCB coordinates, then check the geometry again.
const applySuggestion = (
  circuit: Array<
    ReturnType<typeof component>[number] | ReturnType<typeof board>
  >,
  suggestion: string,
) => {
  const match = /^move (\w+) ([\d.]+)mm (up|down|left|right)/.exec(suggestion)!
  expect(match).not.toBeNull()
  const [, name, distance, direction] = match
  const delta = Number(distance)
  return circuit.map((element) => {
    if (!element.center || element.pcb_component_id !== `pc_${name}`)
      return element
    return {
      ...element,
      center: {
        x:
          element.center.x +
          (direction === "right" ? delta : direction === "left" ? -delta : 0),
        y:
          element.center.y +
          (direction === "up" ? delta : direction === "down" ? -delta : 0),
      },
    }
  })
}

test("supplied reproduction suggests up and labels the top clearance", () => {
  const analysis = analyzeAllPlacements(fixture)
  expect(analysis.getIssues()[0]?.suggested_move).toBe("move R2 0.8mm up")
  expect(analysis.getString()).toContain("R2: 2.8mm inside top edge")
})

for (const { x, y, direction, distance } of [
  { x: 0, y: 1.2, direction: "up", distance: 0.8 },
  { x: 0, y: -1.2, direction: "down", distance: 0.8 },
  { x: 0.6, y: 0, direction: "right", distance: 0.4 },
  { x: -0.6, y: 0, direction: "left", distance: 0.4 },
]) {
  test(`${direction} separation removes the overlap`, () => {
    const circuit = [
      board(),
      ...component("R1", 0, 0),
      ...component("R2", x, y),
    ]
    const issues = analyzeAllPlacements(circuit).getIssues()
    expect(issues).toHaveLength(1)
    const suggestion = issues[0]!.suggested_move!
    expect(suggestion).toBe(`move R2 ${distance}mm ${direction}`)
    expect(
      analyzeAllPlacements(applySuggestion(circuit, suggestion)).getIssues(),
    ).toEqual([])
  })
}

for (const center of [
  { x: 0, y: 0 },
  { x: 20, y: -30 },
]) {
  for (const { x, y, edge, distance } of [
    { x: 0, y: 1.2, edge: "top", distance: 2.8 },
    { x: 0, y: -1.2, edge: "bottom", distance: 2.8 },
    { x: -3, y: 0, edge: "left", distance: 1.5 },
    { x: 3, y: 0, edge: "right", distance: 1.5 },
  ]) {
    test(`${edge} inside clearance on board at (${center.x}, ${center.y})`, () => {
      const circuit = [
        board(center.x, center.y),
        ...component("R1", center.x + x, center.y + y),
      ]
      const analysis = analyzeAllPlacements(circuit)
      const status = analysis.getReport().components[0]!.boardEdgeStatus!
      expect(status).toMatchObject({ edge, status: "inside" })
      expect(status.distance).toBeCloseTo(distance)
      expect(analysis.getString()).toContain(
        `R1: ${distance}mm inside ${edge} edge`,
      )
    })
  }
  for (const { x, y, edge, direction, componentEdge, boardEdge } of [
    {
      x: 0,
      y: 4.5,
      edge: "top",
      direction: "down",
      componentEdge: "pcbTopEdgeY",
      boardEdge: "board.maxY",
    },
    {
      x: 0,
      y: -4.5,
      edge: "bottom",
      direction: "up",
      componentEdge: "pcbBottomEdgeY",
      boardEdge: "board.minY",
    },
    {
      x: -5,
      y: 0,
      edge: "left",
      direction: "right",
      componentEdge: "pcbLeftEdgeX",
      boardEdge: "board.minX",
    },
    {
      x: 5,
      y: 0,
      edge: "right",
      direction: "left",
      componentEdge: "pcbRightEdgeX",
      boardEdge: "board.maxX",
    },
  ]) {
    test(`${edge} outside label and return movement on board at (${center.x}, ${center.y})`, () => {
      const circuit = [
        board(center.x, center.y),
        ...component("R1", center.x + x, center.y + y),
      ]
      const analysis = analyzeAllPlacements(circuit)
      expect(analysis.getReport().components[0]!.boardEdgeStatus).toMatchObject(
        { edge, status: "outside", distance: 0.5 },
      )
      const issue = analysis.getIssues()[0]!
      expect(issue.type).toBe("off_board")
      expect(issue.suggested_move).toBe(
        `move R1 0.5mm ${direction} to clear ${edge} edge`,
      )
      expect(analysis.getString()).toContain(`R1: 0.5mm outside ${edge} edge`)
      expect(
        analyzeAllPlacements(
          applySuggestion(circuit, issue.suggested_move!),
        ).getIssues(),
      ).toEqual([])
      expect(
        analyzeComponentPlacement(circuit, "R1").getLineItems(),
      ).toContainEqual(
        expect.objectContaining({
          line_item_type: "relative_component_edge_to_board_edge_position",
          component_name: "R1",
          component_edge: componentEdge,
          board_edge: boardEdge,
          offset: edge === "top" || edge === "right" ? 0.5 : -0.5,
        }),
      )
    })
  }
}

for (const { y, direction, edge, boardEdge, sign, otherEdge } of [
  {
    y: 3,
    direction: "up",
    edge: "pcbTopEdgeY",
    boardEdge: "board.maxY",
    sign: "+",
    otherEdge: "pcbBottomEdgeY",
  },
  {
    y: -3,
    direction: "down",
    edge: "pcbBottomEdgeY",
    boardEdge: "board.minY",
    sign: "-",
    otherEdge: "pcbTopEdgeY",
  },
]) {
  test(`${direction} component calculation strings agree with structured directions`, () => {
    const circuit = [
      board(),
      ...component("R1", 0, 0),
      ...component("R2", 0, y),
    ]
    const analysis = analyzeComponentPlacement(circuit, "R2")
    expect(analysis.getLineItems()).toContainEqual(
      expect.objectContaining({
        line_item_type: "relative_component_to_component_position",
        direction,
        distance: 3,
      }),
    )
    expect(analysis.getString()).toContain(
      `R2.centerY=calc(board.centerY${sign}3mm)`,
    )
    expect(analysis.getString()).toContain(
      `R2.${edge}=calc(${boardEdge}${sign === "+" ? "-" : "+"}1mm)`,
    )
    expect(analysis.getString()).toContain(
      `R2.${otherEdge}=calc(R1.${direction === "up" ? "maxY" : "minY"}${sign}3mm)`,
    )
  })
}

for (const center of [
  { x: 0, y: 0 },
  { x: 20, y: -30 },
]) {
  test(`vertical empty spans stop at the obstacle on board at (${center.x}, ${center.y})`, () => {
    const barrier = component("R1", center.x, center.y + 1).map((element) =>
      element.type === "source_component" ? element : { ...element, width: 10 },
    )
    const report = analyzeAllPlacements([
      board(center.x, center.y),
      ...barrier,
    ]).getReport().boardTopLayer!
    expect(report.occupiedArea).toBe(20)
    expect(report.largeEmptySpaces).toHaveLength(2)
    for (const [index, minY, maxY, area] of [
      [0, center.y - 5, center.y, 50],
      [1, center.y + 2, center.y + 5, 30],
    ] as const) {
      const space = report.largeEmptySpaces[index]!
      // The empty-space sampler seeds bounds with a 1e-6mm epsilon.
      expect(space.area).toBeCloseTo(area, 3)
      expect(space.bounds.min_x).toBeCloseTo(center.x - 5)
      expect(space.bounds.max_x).toBeCloseTo(center.x + 5)
      expect(space.bounds.min_y).toBeCloseTo(minY)
      expect(space.bounds.max_y).toBeCloseTo(maxY)
    }
  })
}

test("visual reproduction compares the old downward move with the fixed upward move", async () => {
  const circuit = [
    board(),
    ...component("R1", 0, 0),
    ...component("R2", 0, 1.2),
  ]
  const analysis = analyzeAllPlacements(circuit)
  const fixedSuggestion = analysis.getIssues()[0]!.suggested_move!
  const edgeStatus = analysis.getReport().components[1]!.boardEdgeStatus!

  const panel = (
    suggestion: string,
    title: string,
    edge: string,
    color: string,
  ) => {
    const moved = analyzeAllPlacements(
      applySuggestion(circuit, suggestion),
    ).getReport()
    const anchor = moved.components[0]!.resolvedPlacement.bounds!
    const mover = moved.components[1]!.resolvedPlacement.bounds!
    const overlap = Math.max(
      0,
      Math.min(anchor.max_y, mover.max_y) - Math.max(anchor.min_y, mover.min_y),
    )
    const movedY = moved.components[1]!.resolvedPlacement.center!.y
    // SVG uses downward Y; invert it explicitly when drawing PCB coordinates.
    const screenY = (pcbY: number) => 210 - pcbY * 22
    const rect = (
      minY: number,
      maxY: number,
      fill: string,
      stroke: string,
      extra = "",
    ) =>
      `<rect x="164" y="${screenY(maxY)}" width="22" height="${(maxY - minY) * 22}" fill="${fill}" stroke="${stroke}" ${extra}/>`
    return {
      overlap,
      svg: `<text x="20" y="35" font-size="20" font-weight="bold" fill="${color}">${title}</text>
        <text x="20" y="65" font-size="15">${suggestion}</text>
        <text x="20" y="88" font-size="14">R2: ${edgeStatus.distance.toFixed(1)}mm inside ${edge} edge</text>
        <rect x="65" y="100" width="220" height="220" rx="4" fill="#f8fafc" stroke="#64748b"/>
        <text x="175" y="119" text-anchor="middle" font-size="12">TOP: Y = +5</text>
        <text x="175" y="309" text-anchor="middle" font-size="12">BOTTOM: Y = -5</text>
        <path d="M 80 154 L 80 126 L 76 132 M 80 126 L 84 132" fill="none" stroke="#475569"/>
        <text x="86" y="146" font-size="12">+Y</text>
        <line x1="65" y1="210" x2="285" y2="210" stroke="#cbd5e1" stroke-dasharray="3 3"/>
        ${rect(anchor.min_y, anchor.max_y, "#dbeafe", "#2563eb")}
        ${rect(0.2, 2.2, "none", "#64748b", 'stroke-dasharray="3 3"')}
        ${rect(mover.min_y, mover.max_y, "#a7f3d0", "#059669", 'fill-opacity="0.65"')}
        ${overlap > 0 ? rect(Math.max(anchor.min_y, mover.min_y), Math.min(anchor.max_y, mover.max_y), "#fca5a5", "#dc2626", 'fill-opacity="0.85"') : ""}
        <text x="125" y="222" font-size="13" fill="#2563eb">R1</text>
        <text x="195" y="${screenY(movedY) + 5}" font-size="13" fill="#047857">R2</text>
        <path d="M 240 ${screenY(1.2)} L 240 ${screenY(movedY)} L 236 ${screenY(movedY) + (movedY > 1.2 ? 6 : -6)} M 240 ${screenY(movedY)} L 244 ${screenY(movedY) + (movedY > 1.2 ? 6 : -6)}" fill="none" stroke="${color}" stroke-width="2"/>
        <text x="20" y="355" font-size="16" fill="${color}">Overlap after move: ${overlap.toFixed(1)}mm</text>
        <text x="20" y="380" font-size="13">R2 center Y: ${movedY.toFixed(1)}mm</text>`,
    }
  }

  // Retain the reproduced pre-fix wording as the visual comparison baseline.
  const before = panel(
    "move R2 0.8mm down",
    "Before: overlap increases",
    "bottom",
    "#b91c1c",
  )
  const after = panel(
    fixedSuggestion,
    "After: overlap removed",
    edgeStatus.edge,
    "#047857",
  )
  expect(before.overlap).toBeCloseTo(1.6)
  expect(after.overlap).toBe(0)
  await expect(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="430" viewBox="0 0 720 430">
    <rect width="720" height="430" fill="white"/>
    <g font-family="Arial, sans-serif" fill="#0f172a">
      ${before.svg}
      <g transform="translate(360 0)">${after.svg}</g>
      <text x="360" y="415" text-anchor="middle" font-size="13">Dashed outline: original R2 position; red: overlap after movement</text>
    </g>
  </svg>`).toMatchSvgSnapshot(import.meta.path, "before-after")
})
