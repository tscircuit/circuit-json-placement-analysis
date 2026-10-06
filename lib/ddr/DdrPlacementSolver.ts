import { BaseSolver } from "@tscircuit/solver-utils"
import type { AnyCircuitElement } from "circuit-json"
import { createDdrReport, evaluateDdrPlacement } from "./evaluate-ddr-placement"
import { formatDdrPlacementReport } from "./format-ddr-report"
import type { DdrSolverState } from "./types"
import { visualizeDdrState } from "./visualize-ddr-state"

/** BaseSolver completion means screening ended, including a blocked/UNKNOWN result. */
export class DdrPlacementSolver extends BaseSolver {
  private evaluation: ReturnType<typeof evaluateDdrPlacement>
  private report = createDdrReport()
  private state: DdrSolverState = {
    stage: "input",
    completedStages: [],
    status: "running",
    findings: [],
    newFindingIds: [],
    copper: [],
    viaContacts: [],
  }

  constructor(private circuitJson: readonly AnyCircuitElement[]) {
    super()
    this.evaluation = evaluateDdrPlacement(circuitJson)
  }

  override _step() {
    try {
      const next = this.evaluation.next()
      if (next.done) {
        this.solved = true
        return
      }
      const step = next.value
      const previousIds = new Set(this.report.findings.map((f) => f.id))
      this.report = structuredClone(step.report)
      this.state.stage = step.stage
      this.state.location = step.location
      this.state.reason = step.reason
      this.state.findings = this.report.findings
      this.state.newFindingIds = this.report.findings
        .filter((f) => !previousIds.has(f.id))
        .map((f) => f.id)
      if (step.complete && !this.state.completedStages.includes(step.stage))
        this.state.completedStages.push(step.stage)
      if (step.model) {
        this.state.copper = step.model.planes.map((plane) => ({
          layer: plane.layer,
          sourceNetId: plane.net,
          polygons: plane.geometry.map((poly) =>
            poly.map((ring) => ring.map(([x, y]) => ({ x, y }))),
          ),
        }))
        this.state.viaContacts = step.model.vias.map((contact) => ({
          pcbViaId: contact.via.pcb_via_id,
          sourceNetId: contact.net,
          span: contact.layers ?? [],
          contactLayers: [
            ...new Set(
              contact.conductors.flatMap((node) =>
                node.plane ? [node.plane.layer] : [],
              ),
            ),
          ],
        }))
      }
      this.state.status = step.blocked
        ? "blocked"
        : step.stage === "report"
          ? "complete"
          : "running"
      this.solved = this.state.status !== "running"
    } catch (error) {
      this.block(
        "Cannot evaluate this layout: unsupported or inconsistent input geometry.",
        String(error),
      )
    }
    this.stats = {
      stage: this.state.stage,
      status: this.state.status,
      ...this.report.checks,
      findings: this.report.findings.length,
    }
  }

  private block(reason: string, evidence: string) {
    this.report.findings = [
      ...this.report.findings.filter((f) => f.id !== "input_not_evaluated"),
      {
        id: "input_not_evaluated",
        code: "input_not_evaluated",
        severity: "unknown",
        summary: reason,
        location: {},
        evidence: [evidence],
        repairHint: "Correct or review this input, then render/export again.",
        provenance: ["No unsupported geometry is treated as verified"],
      },
    ]
    this.report.status = this.report.findings.some((f) =>
      ["error", "policy_violation", "warning"].includes(f.severity),
    )
      ? "issues_found"
      : "incomplete"
    this.state.status = "blocked"
    this.state.reason = reason
    this.state.findings = this.report.findings
    this.state.newFindingIds = ["input_not_evaluated"]
    this.solved = true
  }

  override tryFinalAcceptance() {
    this.block(
      "Cannot complete this screening within the step limit.",
      `${this.MAX_ITERATIONS} steps reached`,
    )
  }

  computeProgress() {
    return this.solved ? 1 : this.state.completedStages.length / 6
  }
  getCurrentStageName() {
    return this.state.stage
  }
  getState() {
    return structuredClone(this.state)
  }
  getReport() {
    return structuredClone(this.report)
  }
  getString() {
    return this.solved
      ? formatDdrPlacementReport(this.report)
      : `Checking ${this.state.stage}; screening is not complete.`
  }
  getIssues() {
    return this.getReport().findings.filter((f) => f.severity !== "info")
  }
  override getOutput() {
    return this.getReport()
  }
  override getConstructorParams() {
    return [this.circuitJson]
  }
  override visualize() {
    return visualizeDdrState(this.circuitJson, this.report, this.state)
  }
}
