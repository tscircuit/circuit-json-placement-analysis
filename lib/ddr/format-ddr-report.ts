import type { DdrPlacementReport } from "./types"

const escapeMarkdown = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;")
    .replaceAll("`", "&#96;")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ")
const number = (n: number) => Number(n.toFixed(6))
export const formatDdrPlacementReport = (
  report: DdrPlacementReport,
): string => {
  const counts = ["error", "policy_violation", "warning", "unknown", "info"]
    .map(
      (severity) =>
        `${report.findings.filter((f) => f.severity === severity).length} ${severity}`,
    )
    .join(", ")
  const lines = [
    "# DDR Placement Analyzer",
    "",
    `Status: **${report.status.toUpperCase()}** — ${counts}.`,
    "",
    report.stackup
      ? `Stackup: **${report.stackup.provenance.kind.toUpperCase()}** — ${escapeMarkdown(report.stackup.provenance.source)}. Layers: ${report.stackup.copperLayers.map(escapeMarkdown).join(" → ")}.`
      : "Stackup: **UNKNOWN**. Layer count alone does not establish electrical references.",
    `Policy: **${escapeMarkdown(report.policy.name)}** — ${escapeMarkdown(report.policy.provenance)}.`,
    `DDR groups: ${report.groups.length ? report.groups.map((g) => `${escapeMarkdown(g.name)} (${escapeMarkdown(g.provenance)})`).join("; ") : "UNKNOWN"}.`,
    "",
    `Evaluated: ${report.checks.referenceSegments} reference-segment checks, ${report.checks.referenceTransitions} reference-transition pairs, ${report.checks.endpoints} endpoint-reference checks.`,
    "",
    "All positions use board-world mm (+X right, +Y up). DECLARED is supplied design metadata; ASSUMED is conditional caller-selected metadata. Neither is fabricated-hardware verification.",
    "",
    "## Findings",
    "",
  ]
  for (const finding of report.findings) {
    const loc = finding.location
    const positions = loc.start
      ? `(${number(loc.start.x)}, ${number(loc.start.y)})${loc.end ? ` → (${number(loc.end.x)}, ${number(loc.end.y)})` : ""} mm`
      : ""
    const identifiers = [
      loc.sourceNetId && `net ${loc.sourceNetId}`,
      loc.sourceTraceId,
      loc.pcbTraceId,
      loc.component,
      loc.layers?.join(" / "),
      ...(loc.pcbCopperPourIds ?? []),
      ...(loc.pcbViaIds ?? []),
      ...(loc.pcbPortIds ?? []),
      loc.segmentIndex !== undefined && `route[${loc.segmentIndex}]`,
      positions,
    ]
      .filter(Boolean)
      .map((v) => escapeMarkdown(String(v)))
      .join("; ")
    lines.push(
      `### ${finding.severity.toUpperCase()} — ${escapeMarkdown(finding.code)} (${finding.id})`,
      "",
      escapeMarkdown(finding.summary),
      "",
      `Location: ${identifiers || "board/input metadata"}.`,
      "",
      ...finding.evidence.map((e) => `- Evidence: ${escapeMarkdown(e)}`),
      ...finding.provenance.map((p) => `- Provenance: ${escapeMarkdown(p)}`),
      `- Repair: ${escapeMarkdown(finding.repairHint)}`,
      "",
    )
  }
  lines.push(
    "## Limits / NOT EVALUATED",
    "",
    ...report.limits.map((limit) => `- ${escapeMarkdown(limit)}`),
    "",
    "A clear evaluated check is not impedance, crosstalk, timing, EMI, boot, or hardware qualification. No score is produced; deleting metadata cannot establish a better design.",
    "",
  )
  return lines.join("\n")
}
