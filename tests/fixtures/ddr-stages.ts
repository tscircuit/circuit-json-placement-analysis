import { stackSvgsHorizontally, stackSvgsVertically } from "stack-svgs"
import {
  type DdrExample,
  ddrExamples,
  getDdrStageFrame,
  renderDdrExample,
} from "../../examples/ddr-stages"
import { DdrPlacementSolver } from "../../lib"

const xml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

/** One case, six real completed phases, one combined visual/report assertion. */
export const snapshotDdrStages = async (example: DdrExample) => {
  const json = await renderDdrExample(example)
  const before = JSON.stringify(json)
  const solver = new DdrPlacementSolver(json)
  const frames: ReturnType<typeof getDdrStageFrame>[] = []
  let completed = 0
  while (!solver.solved && !solver.failed) {
    if (solver.iterations >= 40) throw new Error("Example exceeded 40 steps")
    solver.step()
    const frame = getDdrStageFrame(solver)
    if (
      frame.state.completedStages.length > completed ||
      frame.state.status === "blocked"
    ) {
      frames.push(frame)
      completed = frame.state.completedStages.length
    }
  }
  if (solver.failed) throw new Error(String(solver.error))
  if (before !== JSON.stringify(json))
    throw new Error("Analyzer changed rendered input")
  const panels = frames.map((frame) => {
    const lines = frame.report
      .replaceAll("**", "")
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => line.match(/.{1,88}(?:\s|$)|.{1,88}/g) ?? [""])
    const height = 540 + lines.length * 21
    return `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="${height}" font-family="Arial, sans-serif"><rect width="820" height="${height}" fill="white"/><desc>${xml(JSON.stringify(frame.state))}</desc><text x="20" y="28" font-size="20" fill="#203746">${xml(ddrExamples[example])}</text><text x="20" y="56" font-size="17" fill="#647784">Step ${frame.step} · ${frame.state.stage} · ${frame.state.status}</text><g transform="translate(20,70)">${frame.svg}</g>${lines.map((line, i) => `<text x="20" y="${540 + i * 21}" font-size="16" fill="#203746">${xml(line)}</text>`).join("")}</svg>`
  })
  const rows = []
  for (let i = 0; i < panels.length; i += 2)
    rows.push(
      stackSvgsHorizontally(panels.slice(i, i + 2), {
        normalizeSize: false,
        gap: 12,
      }),
    )
  return stackSvgsVertically(rows, { normalizeSize: false, gap: 18 })
    .replace(
      /(<svg[^>]*>)/,
      '$1<rect width="100%" height="100%" fill="white"/>',
    )
    .replace(/[ \t]+$/gm, "")
}
