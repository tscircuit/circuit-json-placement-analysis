import type { DdrFinding, DdrPlacementReport } from "./types"

const escapeMarkdown = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/[\r\n]/g, " ")
    .replace(/[[\]*_`]/g, "\\$&")
const number = (n: number) => Number(n.toFixed(3))
const where = (finding: DdrFinding) => {
  const { start, end } = finding.location
  if (!start) return ""
  const x = end ? (start.x + end.x) / 2 : start.x
  const y = end ? (start.y + end.y) / 2 : start.y
  return `Near (${number(x)}, ${number(y)}) mm.`
}
/** Human-first overview. Stable IDs, full evidence, provenance and limits remain in getReport(). */
export const formatDdrPlacementReport = (
  report: DdrPlacementReport,
): string => {
  const assumed = report.stackup?.provenance.kind === "assumed"
  const lines: string[] = assumed
    ? [
        `**ASSUMED stackup:** ${escapeMarkdown(report.stackup!.provenance.source)}. Verify it against the board.`,
        "",
      ]
    : []
  const problems = report.findings.filter((f) => f.severity !== "info")
  const visible = problems.filter(
    (f) =>
      !(
        f.code === "reference_fill_unknown" &&
        problems.some((p) => p.code === "reference_model_incomplete")
      ),
  )
  if (visible.length) {
    for (const f of visible) {
      const label =
        f.severity === "unknown"
          ? "Unknown"
          : f.severity === "policy_violation"
            ? "Policy check"
            : "Needs attention"
      lines.push(
        `**${label}: ${escapeMarkdown(f.summary)}**`,
        where(f),
        `Next: ${escapeMarkdown(f.repairHint)}`,
        "",
      )
    }
  } else if (report.status === "no_issues_in_evaluated_checks") {
    const useful =
      report.findings.find(
        (f) =>
          f.code === "existing_return_connection" ||
          f.code === "same_reference_transition",
      ) ??
      report.findings.find((f) => f.code === "reference_centerline_covered")
    lines.push(
      `**Looks good${assumed ? " for the assumed stackup" : ""}.** ${escapeMarkdown(useful?.summary ?? "No reference-copper problems were found in the evaluated checks.")}`,
      useful ? where(useful) : "",
      useful
        ? escapeMarkdown(useful.repairHint)
        : "Keep the checked reference coverage.",
      "",
    )
  } else {
    lines.push(
      "**Unknown:** there is not enough reference data to check this layout.",
      "Next: supply the final routes, reference assignments and filled copper.",
      "",
    )
  }
  lines.push(
    "Reference-copper geometry only; impedance, timing and boot are not evaluated.",
    "",
  )
  return lines.filter((line, i) => line || lines[i - 1]).join("\n")
}
