// Runes needed to buy the next level, from the Godot version's progression curve.
// `level` is the character's current level (starting at 1); each level is +1 attribute.
export function levelCost(level: number): number {
  const earned = Math.max(0, level - 1)
  return Math.max(1, Math.round(180 + 45 * earned + 8 * earned * earned))
}
