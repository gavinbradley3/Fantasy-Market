# Controlled-beta observed aggregation

The isolated beta selects `playerticker.controlled-beta.observed-aggregation/v1` via
`buildNormalizedInferenceInput(..., { aggregationPolicy: BETA_AGGREGATION_VERSION })`.
Omitting the option preserves production and recorded experimental v1/v2 input behavior.
No curve, model formula, shrinkage, replacement, evidence window or tier-selection rule changes.

## M08: zero-target appearances

nflfastR defines `target_share` as player targets divided by all team targets:
[provider field definition](https://nflfastr.com/reference/nfl_stats_variables.html).
For each provider capture/team/game, a positive-target teammate's targets/share recovers that
same denominator. The beta checks that every usable peer agrees on a positive integer count
(serialization tolerance only). It does not sum incomplete player rows or use pass attempts.
Observed zero-target appearances contribute zero to the numerator and the observed team
count to the denominator. Absent or conflicting denominator evidence makes the whole-window
share unknown, not a silently shortened window. Cross-team, cross-game and cross-capture
denominators cannot be substituted.

## M09: incomplete columns

Legacy aggregation sums whichever rows contain a column but supplies the full appearance
count. For example, 100 passing yards plus one missing game becomes a 100-yard total over two
games. The beta withholds that incomplete total rather than reporting an implied 50 observed
yards/game. This applies to QB counting and career-rate inputs and accessible production
windows. Independently summed AY/A components must all cover the same complete window.
Historical rows, full game counts, and genuine observed zeroes remain intact.

`input.evidence.aggregationCoverage` identifies policy version, affected field/window,
observed/total counts and unavailable game IDs. The isolated beta must hold numerical
eligibility when `numericalEvidenceComplete` is false. Such a hold is neither an ordinary
model INSUFFICIENT outcome nor evidence of zero player value. Merely passing nulls into a
model is insufficient protection because some legacy consumers supply defaults or use other
components. Full missingness and partial missingness have separate reason codes.

## Verification

`npm test -- src/ingestion/aggregationPolicy.test.ts` covers real normalization, evidence-driven
tier selection and the WR numerical consumer, plus zero/missing/contradictory denominators,
partial totals, career rates, original-default compatibility and deterministic replay.

The retained 417-player September 22 snapshot has all beta-audited aggregation columns and
WR denominators: no new aggregation holds. Fourteen WR provider shares change materially.
Eleven RB and eight TE stored provider shares also change, but their current accessible
models do not consume this field. M09 is demonstrated synthetically at the actual aggregation
boundaries; absence of a triggering population row does not establish general correctness.
This evidence-construction comparison does not approve any player value or role claim.
