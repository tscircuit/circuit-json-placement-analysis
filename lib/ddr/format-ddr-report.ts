import type { DdrPlacementReport, DdrPoint } from "./types"

const escapeMarkdown = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;")
    .replaceAll("`", "&#96;")
    .replace(/[\r\n]/g, " ")
const position = (p: DdrPoint) =>
  `(${Number(p.x.toFixed(6))}, ${Number(p.y.toFixed(6))})`
export const formatDdrPlacementReport = (
  report: DdrPlacementReport,
): string => {
  const stack = report.stackup
  const kind = stack?.provenance.kind.toUpperCase() ?? "UNKNOWN"
  const counts = ["error", "policy_violation", "warning", "unknown", "info"]
    .map(
      (s) => `${report.findings.filter((f) => f.severity === s).length} ${s}`,
    )
    .join(", ")
  const lines = [
    "# DDR Placement Analyzer",
    "",
    `Status: **${report.status.toUpperCase()}** (${counts}).`,
    `Stackup: **${kind}**${stack ? ` — ${escapeMarkdown(stack.provenance.source)}; ${stack.copperLayers.map(escapeMarkdown).join(" → ")}` : "; electrical references are NOT EVALUATED"}.`,
    `Evaluated: ${report.checks.referenceSegments} reference segments, ${report.checks.referenceTransitions} transition pairs. Coordinates: board-world mm (+X right, +Y up).`,
    "",
    ...Array.from(new Set(report.findings.flatMap((f) => f.provenance))).map(
      (p) => `- ${escapeMarkdown(p)}`,
    ),
    "",
    "DECLARED is supplied design metadata; ASSUMED findings are conditional on the caller-selected stackup. Neither verifies fabricated hardware.",
    "",
    "| Finding | Location | Evidence and repair |",
    "| --- | --- | --- |",
  ]
  for (const f of report.findings) {
    const l = f.location
    const location = [
      l.sourceNetId,
      l.sourceTraceId,
      l.pcbTraceId,
      ...(l.layers ?? []),
      ...(l.pcbCopperPourIds ?? []),
      ...(l.pcbViaIds ?? []),
      l.segmentIndex === undefined ? "" : `route[${l.segmentIndex}]`,
      l.start
        ? `${position(l.start)}${l.end ? ` → ${position(l.end)}` : ""} mm`
        : "",
    ]
      .filter(Boolean)
      .join("; ")
    lines.push(
      `| ${kind} **${f.severity.toUpperCase()}** ${escapeMarkdown(f.code)} (${f.id})<br>${escapeMarkdown(f.summary)} | ${escapeMarkdown(location || "input metadata")} | ${f.evidence.map(escapeMarkdown).join("<br>")}<br>Repair: ${escapeMarkdown(f.repairHint)} |`,
    )
  }
  lines.push(
    "",
    "NOT EVALUATED / limits:",
    ...report.limits.map((l) => `- ${escapeMarkdown(l)}`),
    "",
    "A clear check is not SI, EMI, timing or boot signoff. No score is produced.",
    "",
  )
  return lines.join("\n")
}
