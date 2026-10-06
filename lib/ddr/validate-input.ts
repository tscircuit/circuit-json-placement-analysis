import { any_circuit_element } from "circuit-json"

const consumed = new Set([
  "pcb_board",
  "source_net",
  "source_trace",
  "source_port",
  "pcb_port",
  "pcb_trace",
  "pcb_via",
  "pcb_smtpad",
  "pcb_plated_hole",
  "pcb_copper_pour",
])

const nonFiniteField = (value: unknown, path = ""): string | undefined => {
  if (typeof value === "number" && !Number.isFinite(value)) return path
  if (value && typeof value === "object")
    for (const [key, child] of Object.entries(value)) {
      const found = nonFiniteField(child, path ? `${path}.${key}` : key)
      if (found) return found
    }
}

/** Validate consumed records without replacing, defaulting or modifying the export. */
export const validateDdrInput = (input: unknown): string | undefined => {
  if (!Array.isArray(input))
    return "Cannot evaluate this input: expected a Circuit JSON array."
  const ids = new Set<string>()
  for (const element of input) {
    if (
      !element ||
      typeof element !== "object" ||
      typeof element.type !== "string"
    )
      return "Cannot evaluate this input: a Circuit JSON record has no element type."
    if (!consumed.has(element.type)) continue
    const parsed = any_circuit_element.safeParse(element)
    if (!parsed.success) {
      const first = parsed.error.issues[0]!
      const issue =
        first.code === "invalid_union"
          ? (first.unionErrors.find(
              (error) => !error.issues.some((i) => i.path[0] === "type"),
            )?.issues[0] ?? first)
          : first
      const field = issue.path
        .map((p) => (typeof p === "number" ? `[${p}]` : p))
        .join(".")
        .replaceAll(".[", "[")
      return `Cannot evaluate this layout: ${element.type.replaceAll("_", " ")} has invalid ${field || "geometry"}.`
    }
    const invalidNumber = nonFiniteField(parsed.data)
    if (invalidNumber)
      return `Cannot evaluate this layout: ${element.type.replaceAll("_", " ")} has a non-finite ${invalidNumber}.`
    if (
      element.type === "pcb_board" &&
      ((element.width !== undefined && element.width <= 0) ||
        (element.height !== undefined && element.height <= 0))
    )
      return "Cannot evaluate this layout: board dimensions must be positive."
    const key = `${element.type}:${element[`${element.type}_id`]}`
    if (ids.has(key))
      return `Cannot evaluate this layout: duplicate ${element.type.replaceAll("_", " ")} identity.`
    ids.add(key)
  }
}
