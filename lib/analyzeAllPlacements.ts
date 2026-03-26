import { analyzeComponentPlacement } from "./analyzeComponentPlacement"
import {
  buildPlacementAnalysisReport,
  formatPlacementAnalysisReport,
} from "./buildPlacementAnalysisReport"
import type {
  AnalysisLineItem,
  PlacementAnalysisReport,
  PlacementIssue,
} from "./types"

type CircuitElement = {
  type?: string
  [key: string]: unknown
}

export type AnalyzeAllPlacementsResult = {
  getLineItems: () => AnalysisLineItem[]
  getString: () => string
  getIssues: () => PlacementIssue[]
  getReport: () => PlacementAnalysisReport
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
  const report = buildPlacementAnalysisReport(circuitJson)

  return {
    getLineItems: () => lineItems,
    getString: () => formatPlacementAnalysisReport(report),
    getIssues: () => report.issues,
    getReport: () => report,
  }
}
