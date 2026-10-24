export const flexTailOutline = [
  { x: -5, y: -5 },
  { x: 5, y: -5 },
  { x: 5, y: -2 },
  { x: 30, y: -2 },
  { x: 30, y: 2 },
  { x: 5, y: 2 },
  { x: 5, y: 5 },
  { x: -5, y: 5 },
]

export default function AsymmetricFlexTail() {
  return (
    <board schematicDisabled routingDisabled outline={flexTailOutline}>
      <resistor name="R_TAIL" resistance="1k" footprint="0402" pcbX={27} />
      <pcbnotetext
        text="R_TAIL is inside the asymmetric tail"
        pcbY={-4}
        fontSize={0.4}
      />
    </board>
  )
}
