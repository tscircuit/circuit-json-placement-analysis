import { analyzeComponentPlacement } from "./analyzeComponentPlacement"
import type { AnalysisLineItem } from "./types"

type CircuitElement = {
  type?: string
  [key: string]: unknown
}

export type AnalyzeAllPlacementsResult = {
  getLineItems: () => AnalysisLineItem[]
  getString: () => string
}

export const analyzeAllPlacements = (
  circuitJson: CircuitElement[],
): AnalyzeAllPlacementsResult => {
  const componentNames: string[] = []
  const seenNames = new Set<string>()

  for (const el of circuitJson) {
    if (el.type !== "source_component" || typeof el.name !== "string") continue
    if (seenNames.has(el.name)) continue
    seenNames.add(el.name)
    componentNames.push(el.name)
  }

  const analyses = componentNames.map((componentName) => ({
    componentName,
    analysis: analyzeComponentPlacement(circuitJson, componentName),
  }))

  const lineItems = analyses.flatMap(({ analysis }) => analysis.getLineItems())

  return {
    getLineItems: () => lineItems,
    getString: () =>
      analyses.map(({ analysis }) => analysis.getString()).join("\n"),
  }
}
