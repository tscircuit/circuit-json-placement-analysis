import { expect, test } from "bun:test"
import { renderDdrExample } from "../examples/ddr-stages"
import { analyzeDdrPlacement, DdrPlacementSolver } from "../lib"

test("stepped screening retains earlier state and matches synchronous output", async () => {
  const json = await renderDdrExample("gap")
  const input = structuredClone(json)
  const solver = new DdrPlacementSolver(json)
  const states = []
  expect(solver.getString()).toContain("screening is not complete")
  while (!solver.solved && solver.iterations < 40) {
    solver.step()
    const state = solver.getState()
    states.push({ state, saved: structuredClone(state) })
    if (!state.completedStages.includes("coverage"))
      expect(
        state.findings.some((f) => f.code === "reference_coverage_gap"),
      ).toBe(false)
  }
  expect(solver.getState().status).toBe("complete")
  expect(solver.getReport()).toEqual(analyzeDdrPlacement(json).getReport())
  expect(json).toEqual(input)
  for (const { state, saved } of states) expect(state).toEqual(saved)
})

test("unsupported inputs stop with one UNKNOWN instead of throwing or cascading", async () => {
  const invalidRoute = await renderDdrExample("intact")
  const route = invalidRoute.find((e) => e.type === "pcb_trace")!
  if (route.type !== "pcb_trace" || route.route[0]?.route_type !== "wire")
    throw new Error("Fixture has no routed wire")
  route.route[0].width = Number.NaN
  for (const input of [
    null,
    {},
    [null],
    [{ type: "pcb_trace" }],
    invalidRoute,
  ]) {
    const solver = new DdrPlacementSolver(input as never)
    expect(() => {
      solver.visualize()
      solver.solve()
      solver.visualize()
    }).not.toThrow()
    expect(solver.getState().status).toBe("blocked")
    expect(solver.failed).toBe(false)
    expect(solver.getReport().findings.map((f) => f.severity)).toEqual([
      "unknown",
    ])
    expect(solver.getReport().checks).toEqual({
      referenceSegments: 0,
      referenceTransitions: 0,
    })
  }
})

test("a later blocked stage or step limit retains completed physical faults", async () => {
  // Adversarial imported JSON, separate from the untouched shipped TSX examples.
  const rendered = await renderDdrExample("missing-return")
  const plane = rendered.find(
    (e) => e.type === "pcb_copper_pour" && e.layer === "inner1",
  )!
  if (plane.type !== "pcb_copper_pour") throw new Error("Fixture has no plane")
  const signalVia = rendered.find(
    (e) => e.type === "pcb_via" && e.pcb_trace_id,
  )!
  const json = rendered.filter((e) => e !== signalVia)
  json.push(
    {
      type: "source_net",
      source_net_id: "synthetic_vdd",
      name: "VDD",
      member_source_group_ids: [],
      is_power: true,
    },
    {
      ...structuredClone(plane),
      pcb_copper_pour_id: "synthetic_overlap",
      source_net_id: "synthetic_vdd",
    },
  )
  for (const limited of [false, true]) {
    const solver = new DdrPlacementSolver(json)
    if (limited) solver.MAX_ITERATIONS = 3
    solver.solve()
    expect(solver.getState().status).toBe("blocked")
    expect(solver.getReport().status).toBe("issues_found")
    expect(
      solver
        .getIssues()
        .some(
          (f) => f.code === "reference_copper_short" && f.severity === "error",
        ),
    ).toBe(true)
    expect(solver.getString()).toContain("Two different reference nets overlap")
    expect(
      solver.getIssues().filter((f) => f.severity === "unknown"),
    ).toHaveLength(1)
    expect(solver.getReport()).toEqual(
      limited ? solver.getOutput() : analyzeDdrPlacement(json).getReport(),
    )
  }
})
