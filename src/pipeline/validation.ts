// Canonical-record validation — the second validation boundary (the first is
// each provider adapter's zod schema on the raw payload). This layer enforces
// SEMANTIC invariants a canonical player must satisfy regardless of source:
// identity present, position supported, present numeric fields in sane ranges.
// Missing fields are legal (that is the whole point of FieldState); an INVALID
// present value is not.
//
// Validation failures carry actionable context (which field, which player)
// without dumping raw payloads.

import type { CanonicalPlayer, FieldState } from '@/pipeline/types';
import { isSupportedPosition } from '@/pipeline/types';

export interface ValidationIssue {
  readonly canonicalId: string;
  readonly field: string;
  readonly message: string;
}

function checkRange(
  field: FieldState<number>,
  name: string,
  min: number,
  max: number,
  canonicalId: string,
  issues: ValidationIssue[],
): void {
  if (!field.present) return;
  const v = field.value;
  if (!Number.isFinite(v) || v < min || v > max) {
    issues.push({
      canonicalId,
      field: name,
      message: `value ${v} outside expected range [${min}, ${max}]`,
    });
  }
}

/** Returns issues for a single canonical player (empty = valid). */
export function validateCanonicalPlayer(player: CanonicalPlayer): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const id = player.identity.canonical_id;

  if (!id || id.trim().length === 0) {
    issues.push({ canonicalId: id ?? '<none>', field: 'identity.canonical_id', message: 'missing canonical id' });
  }
  if (!isSupportedPosition(player.position)) {
    issues.push({ canonicalId: id, field: 'position', message: `unsupported position ${player.position}` });
  }
  const hasStrongId = Object.values(player.identity.provider_ids).some((v) => !!v);
  if (!hasStrongId) {
    issues.push({ canonicalId: id, field: 'identity.provider_ids', message: 'no provider id retained' });
  }

  checkRange(player.age, 'age', 18, 50, id, issues);
  checkRange(player.nfl_seasons_completed, 'nfl_seasons_completed', 0, 30, id, issues);
  checkRange(player.draft_round, 'draft_round', 1, 7, id, issues);
  checkRange(player.draft_pick, 'draft_pick', 1, 300, id, issues);
  checkRange(player.draft_year, 'draft_year', 1960, 2100, id, issues);
  checkRange(player.rookie_year, 'rookie_year', 1960, 2100, id, issues);
  checkRange(player.height_inches, 'height_inches', 60, 90, id, issues);
  checkRange(player.weight_pounds, 'weight_pounds', 140, 400, id, issues);
  checkRange(player.jersey_number, 'jersey_number', 0, 99, id, issues);

  return issues;
}

export interface CanonicalValidationResult {
  readonly valid: readonly CanonicalPlayer[];
  readonly rejected: readonly { player: CanonicalPlayer; issues: readonly ValidationIssue[] }[];
  readonly issues: readonly ValidationIssue[];
}

/** Partition a set of canonical players into valid and rejected (with issues). */
export function validateCanonicalPlayers(players: readonly CanonicalPlayer[]): CanonicalValidationResult {
  const valid: CanonicalPlayer[] = [];
  const rejected: { player: CanonicalPlayer; issues: ValidationIssue[] }[] = [];
  const allIssues: ValidationIssue[] = [];
  for (const player of players) {
    const issues = validateCanonicalPlayer(player);
    if (issues.length === 0) valid.push(player);
    else {
      rejected.push({ player, issues });
      allIssues.push(...issues);
    }
  }
  return { valid, rejected, issues: allIssues };
}
