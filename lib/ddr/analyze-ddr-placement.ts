import type { AnyCircuitElement } from "circuit-json"
import { DdrPlacementSolver } from "./DdrPlacementSolver"
import { formatDdrPlacementReport } from "./format-ddr-report"

/** Screen rendered Circuit JSON; stepping and synchronous use run the same checks. */
export const analyzeDdrPlacement = (
  circuitJson: readonly AnyCircuitElement[],
) => {
  const solver = new DdrPlacementSolver(circuitJson)
  solver.solve()
  const report = solver.getOutput()!
  return {
    getString: () => formatDdrPlacementReport(report),
    getReport: () => report,
    getIssues: () =>
      report.findings.filter((finding) => finding.severity !== "info"),
  }
}
