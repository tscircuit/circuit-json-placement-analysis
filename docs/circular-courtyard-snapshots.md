# Circular courtyard regression snapshots

The fixture has two unchanged 1 mm square component bodies. Their circular courtyards have radius 2 mm and centers 3 mm apart, so the courtyards overlap by 1 mm. It has no cached DRC error records.

The SVG draws this fixture directly. Its heading and collision count come from the actual placement report, not a manually selected expected status. The text snapshot stores the complete actual `analysis.getString()` result.

On the foundational branch (PR #27), the snapshots show the bug: the report says there are no placement issues and reports zero courtyard collisions, although the circles visibly overlap. A separate Bun `test.failing` expects the correct collision count of one and records the known failure. The ordinary snapshot test must still match both bad snapshots. Keeping the tests separate prevents a snapshot mismatch from satisfying the expected-failure test.

On the reporting-fix branch (PR #28), the same test and fixture should produce updated snapshots reporting one courtyard collision. No component, board, or courtyard moves. Only the reporting logic and resulting snapshots change. The fix changes `test.failing` to a normal `test`, and the same collision assertion passes. A “good” or “fixed” snapshot means the checker correctly detects the overlap; it does not mean the board is legal. The courtyard geometry remains overlapping and still needs a layout change in a real design.

Run the focused test:

```sh
bun test tests/repro-circular-courtyard-snapshot.test.ts
```

To record the actual current output when deliberately updating snapshots:

```sh
BUN_UPDATE_SNAPSHOTS=1 bun test -u tests/repro-circular-courtyard-snapshot.test.ts
```

Updating bad snapshots on PR #27 does not fix the collision assertion; it remains an expected failure. The diagram shows geometry and report status; occupancy and suggested movement remain bounds-based estimates.
