# DDR Placement Analyzer

Status: **NO_ISSUES_IN_EVALUATED_CHECKS** — 0 error, 0 policy_violation, 0 warning, 0 unknown, 8 info.

Stackup: **ASSUMED** — Caller-selected generic six-layer expected stack; geometry conditional. Layers: top → inner1 → inner2 → inner3 → inner4 → bottom.
Policy: **generic_reviewed** — Illustrative review policy; not manufacturer qualification.
DDR groups: DQ (Explicit rendered TSX pin-to-pin DQ0 trace ID).

Evaluated: 3 reference-segment checks, 2 reference-transition pairs, 2 endpoint-reference checks.

All positions use board-world mm (+X right, +Y up). DECLARED is supplied design metadata; ASSUMED is conditional caller-selected metadata. Neither is fabricated-hardware verification.

## Findings

### INFO — endpoint_reference_anchored (endpoint_reference_anchored_2a0ab5bb73d468c7)

Endpoint component has an actual modeled copper path to the assigned reference island.

Location: net source_net_1; source_trace_0; generic_ddr_route; U2; inner1 / top; generic_inner1; pcb_port_2; pcb_port_3; route[4]; (8, 0) mm.

- Evidence: end endpoint reference terminals reached through positive copper contacts and physical via spans.
- Provenance: ASSUMED stackup: Caller-selected generic six-layer expected stack; geometry conditional
- Provenance: Policy: generic_reviewed; Illustrative review policy; not manufacturer qualification
- Provenance: DDR membership DQ: Explicit rendered TSX pin-to-pin DQ0 trace ID
- Provenance: DECLARED final fill: Generic canonical final fill import with explicit polygon voids
- Repair: Retain this physical connection; package/internal SI remains outside this check.

### INFO — endpoint_reference_anchored (endpoint_reference_anchored_633c6be3347a7057)

Endpoint component has an actual modeled copper path to the assigned reference island.

Location: net source_net_1; source_trace_0; generic_ddr_route; U1; inner1 / top; generic_inner1; pcb_port_0; pcb_port_1; route[0]; (-8, 0) mm.

- Evidence: start endpoint reference terminals reached through positive copper contacts and physical via spans.
- Provenance: ASSUMED stackup: Caller-selected generic six-layer expected stack; geometry conditional
- Provenance: Policy: generic_reviewed; Illustrative review policy; not manufacturer qualification
- Provenance: DDR membership DQ: Explicit rendered TSX pin-to-pin DQ0 trace ID
- Provenance: DECLARED final fill: Generic canonical final fill import with explicit polygon voids
- Repair: Retain this physical connection; package/internal SI remains outside this check.

### INFO — existing_return_connection (existing_return_connection_903188d8193a0c0d)

An existing nearby same-net via physically contacts both required reference planes.

Location: net source_net_1; source_trace_0; generic_ddr_route; bottom / inner1 / inner4 / top; generic_inner1; generic_inner4; generic_anchor_u2; generic_signal_entry; route[3]; (7.5, 0) mm.

- Evidence: Chosen maximum distance 1.2 mm.
- Evidence: generic_anchor_u1: distance 15.532225 mm; contacts both reference islands
- Evidence: generic_anchor_u2: distance 1.118034 mm; contacts both reference islands
- Evidence: generic_existing_return: distance 7.532596 mm; contacts both reference islands
- Evidence: generic_signal_main: distance 7.5 mm; no actual contact to both required reference islands
- Provenance: ASSUMED stackup: Caller-selected generic six-layer expected stack; geometry conditional
- Provenance: Policy: generic_reviewed; Illustrative review policy; not manufacturer qualification
- Provenance: DDR membership DQ: Explicit rendered TSX pin-to-pin DQ0 trace ID
- Provenance: DECLARED final fill: Generic canonical final fill import with explicit polygon voids
- Repair: Retain the existing qualifying return connection; a redundant new stitch is unnecessary.

### INFO — existing_return_connection (existing_return_connection_ba8d6b7ab16848a9)

An existing nearby same-net via physically contacts both required reference planes.

Location: net source_net_1; source_trace_0; generic_ddr_route; bottom / inner1 / inner4 / top; generic_inner1; generic_inner4; generic_existing_return; generic_signal_main; route[1]; (0, 0) mm.

- Evidence: Chosen maximum distance 1.2 mm.
- Evidence: generic_anchor_u1: distance 8.062258 mm; contacts both reference islands
- Evidence: generic_anchor_u2: distance 8.062258 mm; contacts both reference islands
- Evidence: generic_existing_return: distance 0.7 mm; contacts both reference islands
- Evidence: generic_signal_entry: distance 7.5 mm; no actual contact to both required reference islands
- Provenance: ASSUMED stackup: Caller-selected generic six-layer expected stack; geometry conditional
- Provenance: Policy: generic_reviewed; Illustrative review policy; not manufacturer qualification
- Provenance: DDR membership DQ: Explicit rendered TSX pin-to-pin DQ0 trace ID
- Provenance: DECLARED final fill: Generic canonical final fill import with explicit polygon voids
- Repair: Retain the existing qualifying return connection; a redundant new stitch is unnecessary.

### INFO — isolated_signal_antipad (isolated_signal_antipad_b2d1b558f551b468)

Bounded isolated clearance at the signal via is explicitly accounted for.

Location: net source_net_1; source_trace_0; generic_ddr_route; bottom / inner4; generic_inner4; generic_signal_main; route[1]; (0, 0) → (0.2, 0) mm.

- Evidence: Continuous interval intersection: uncovered length 0.2 mm on inner4.
- Evidence: Inner ring 0, bounded radius 0.3 mm; one via center, closed interior void.
- Provenance: ASSUMED stackup: Caller-selected generic six-layer expected stack; geometry conditional
- Provenance: Policy: generic_reviewed; Illustrative review policy; not manufacturer qualification
- Provenance: DDR membership DQ: Explicit rendered TSX pin-to-pin DQ0 trace ID
- Provenance: DECLARED final fill: Generic canonical final fill import with explicit polygon voids
- Provenance: Generic solved local antipad
- Repair: Keep this local clearance; separately review surrounding coverage and return transition.

### INFO — isolated_signal_antipad (isolated_signal_antipad_cf7a160eb3db7151)

Bounded isolated clearance at the signal via is explicitly accounted for.

Location: net source_net_1; source_trace_0; generic_ddr_route; inner1 / top; generic_inner1; generic_signal_entry; route[3]; (7.5, 0) → (7.7, 0) mm.

- Evidence: Continuous interval intersection: uncovered length 0.2 mm on inner1.
- Evidence: Inner ring 1, bounded radius 0.3 mm; one via center, closed interior void.
- Provenance: ASSUMED stackup: Caller-selected generic six-layer expected stack; geometry conditional
- Provenance: Policy: generic_reviewed; Illustrative review policy; not manufacturer qualification
- Provenance: DDR membership DQ: Explicit rendered TSX pin-to-pin DQ0 trace ID
- Provenance: DECLARED final fill: Generic canonical final fill import with explicit polygon voids
- Provenance: Generic solved final BGA-entry antipad
- Repair: Keep this local clearance; separately review surrounding coverage and return transition.

### INFO — isolated_signal_antipad (isolated_signal_antipad_e1a25a7ed5434ef7)

Bounded isolated clearance at the signal via is explicitly accounted for.

Location: net source_net_1; source_trace_0; generic_ddr_route; bottom / inner4; generic_inner4; generic_signal_entry; route[1]; (7.3, 0) → (7.5, 0) mm.

- Evidence: Continuous interval intersection: uncovered length 0.2 mm on inner4.
- Evidence: Inner ring 1, bounded radius 0.3 mm; one via center, closed interior void.
- Provenance: ASSUMED stackup: Caller-selected generic six-layer expected stack; geometry conditional
- Provenance: Policy: generic_reviewed; Illustrative review policy; not manufacturer qualification
- Provenance: DDR membership DQ: Explicit rendered TSX pin-to-pin DQ0 trace ID
- Provenance: DECLARED final fill: Generic canonical final fill import with explicit polygon voids
- Provenance: Generic solved final BGA-entry antipad
- Repair: Keep this local clearance; separately review surrounding coverage and return transition.

### INFO — isolated_signal_antipad (isolated_signal_antipad_e8ec6122bdf650d7)

Bounded isolated clearance at the signal via is explicitly accounted for.

Location: net source_net_1; source_trace_0; generic_ddr_route; inner1 / top; generic_inner1; generic_signal_main; route[0]; (-0.2, 0) → (0, 0) mm.

- Evidence: Continuous interval intersection: uncovered length 0.2 mm on inner1.
- Evidence: Inner ring 0, bounded radius 0.3 mm; one via center, closed interior void.
- Provenance: ASSUMED stackup: Caller-selected generic six-layer expected stack; geometry conditional
- Provenance: Policy: generic_reviewed; Illustrative review policy; not manufacturer qualification
- Provenance: DDR membership DQ: Explicit rendered TSX pin-to-pin DQ0 trace ID
- Provenance: DECLARED final fill: Generic canonical final fill import with explicit polygon voids
- Provenance: Generic solved local antipad
- Repair: Keep this local clearance; separately review surrounding coverage and return transition.

## Limits / NOT EVALUATED

- Only caller-identified final filled copper is evaluated. The caller must include all clearance holes, antipads, cutouts and solved thermal spokes; requested pour outlines are insufficient.
- Straight-edge polygon/BRep and rotated rectangular pours are supported. Curved BRep bulges, through_pad route geometry, pill pads, plated holes and separate thermal spokes are UNKNOWN when present in the reference model.
- Contacts require positive copper overlap. Via annulus contacts use exact radial overlap against polygon boundaries; circular terminal pads use conservative 128-sided polygons (radial error &lt;= 0.031%); marginal contacts are not hardware continuity proof. Zero-width touching copper needs review.
- Every supplied signal/reference assignment is examined, including dual-sided references. Missing assignments cannot be inferred; electromagnetic sharing between references is NOT EVALUATED.
- Narrow-clearance and height-scaled corridor warnings are local geometric policies. Whole-plane neck/detour impedance, return-loop inductance, capacitive-return bandwidth and field solving are NOT EVALUATED.
- DDR keepout/shielding, component placement distance, timing/length/skew, impedance, crosstalk, EMI and package/internal return paths are NOT EVALUATED. No manufacturer compliance profile is claimed.
- Endpoint checks establish modeled copper paths to the endpoint component's declared reference terminals, not package-internal continuity. Missing source/PCB port mapping is UNKNOWN.

A clear evaluated check is not impedance, crosstalk, timing, EMI, boot, or hardware qualification. No score is produced; deleting metadata cannot establish a better design.
