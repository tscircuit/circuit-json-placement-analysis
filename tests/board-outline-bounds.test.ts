import { expect, test } from "bun:test"
import { analyzeAllPlacements, analyzeComponentPlacement } from "../lib/index"
import { flexTailOutline } from "./fixtures/asymmetric-flex-tail"

const makeCircuit = (board: Record<string, unknown>, x = 27, y = 0) => [
  {
    type: "pcb_board",
    center: { x: 0, y: 0 },
    width: 35,
    height: 10,
    ...board,
  },
  {
    type: "source_component",
    source_component_id: "source_r",
    name: "R_TAIL",
    ftype: "simple_resistor",
  },
  {
    type: "pcb_component",
    source_component_id: "source_r",
    pcb_component_id: "pcb_r",
    center: { x, y },
    width: 2,
    height: 1,
    layer: "top",
  },
]

test("board outline coordinates are already in board space, including translated outlines", () => {
  const circuit = makeCircuit(
    {
      center: { x: 100, y: -40 },
      outline: flexTailOutline.map(({ x, y }) => ({ x: x + 100, y: y - 40 })),
    },
    127,
    -40,
  )
  const analysis = analyzeAllPlacements(circuit)
  expect(
    analysis.getIssues().filter((issue) => issue.type === "off_board"),
  ).toEqual([])
  expect(analysis.getReport().components[0]?.boardEdgeStatus).toMatchObject({
    edge: "right",
    status: "inside",
    distance: 2,
  })
  expect(analyzeComponentPlacement(circuit, "R_TAIL").getString()).toContain(
    "R_TAIL.pcbRightEdgeX=calc(board.maxX-2mm)",
  )
  expect(analyzeComponentPlacement(circuit, "R_TAIL").getString()).toContain(
    "R_TAIL.centerX=calc(board.centerX+27mm)",
  )
})

test("a real overhang beyond the outline is still reported with the correct move", () => {
  const analysis = analyzeAllPlacements(
    makeCircuit({ outline: flexTailOutline }, 32),
  )
  expect(
    analysis.getIssues().filter((issue) => issue.type === "off_board"),
  ).toMatchObject([
    {
      componentA: "R_TAIL",
      clearance: -3,
      suggested_move: "move R_TAIL 3mm left to clear right edge",
    },
  ])
})

test("an outline-only board does not require center, width or height for edge analysis", () => {
  const circuit = makeCircuit({
    center: undefined,
    width: undefined,
    height: undefined,
    outline: flexTailOutline,
  })
  expect(
    analyzeAllPlacements(circuit).getReport().components[0]?.boardEdgeStatus,
  ).toMatchObject({ edge: "right", status: "inside", distance: 2 })
  expect(analyzeComponentPlacement(circuit, "R_TAIL").getString()).toContain(
    "R_TAIL.pcbRightEdgeX=calc(board.maxX-2mm)",
  )
})

test.each([
  { label: "missing", outline: undefined },
  { label: "empty", outline: [] },
  {
    label: "two points",
    outline: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  },
  {
    label: "non-finite point",
    outline: [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: Number.NaN, y: 5 },
    ],
  },
])(
  "missing or invalid outlines preserve the rectangular fallback: $label",
  ({ outline }) => {
    const circuit = makeCircuit({ outline })
    expect(
      analyzeAllPlacements(circuit).getReport().components[0]?.boardEdgeStatus,
    ).toMatchObject({ edge: "right", status: "outside", distance: 10.5 })
    expect(analyzeComponentPlacement(circuit, "R_TAIL").getString()).toContain(
      "R_TAIL.pcbRightEdgeX=calc(board.maxX+10.5mm) [offboard]",
    )
  },
)
