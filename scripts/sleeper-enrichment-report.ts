/**
 * Measure what Sleeper enrichment actually changed.
 *
 *   npm run report:sleeper-enrichment -- --baseline .local/base.db --enriched .local/slp.db
 *
 * WHY THIS SCRIPT EXISTS
 * nflverse publishes a player `status` but no injury feed, so `inactive` conflates two very
 * different states: a player on injured reserve, and a free agent between contracts. Roughly
 * 46% of the board sits in that state. Sleeper's players resource carries a per-player injury
 * designation, which splits it.
 *
 * Whether that split is worth enabling by default is a measurement, not an opinion, and this
 * script is the measurement. Run two ingests from the SAME captures — one with `--sleeper`, one
 * without — and point it at both databases.
 *
 * IT INVENTS NOTHING. Every number below is read from persisted artifacts. Players Sleeper did
 * not resolve are reported as unresolved rather than assumed healthy, and a designation that is
 * absent stays absent.
 */

import { DatabaseSync } from 'node:sqlite';

interface Args {
  baseline: string;
  enriched: string;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { baseline: '.local/base.db', enriched: '.local/slp.db', json: false };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i] as string;
    switch (argv[i]) {
      case '--baseline': args.baseline = next(); break;
      case '--enriched': args.enriched = next(); break;
      case '--json': args.json = true; break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  return args;
}

/** One player as the persisted artifacts describe him. */
interface Row {
  canonicalId: string;
  position: string;
  name: string;
  status: string | null;
  statusProvider: string | null;
  statusProvenance: string | null;
  designation: string | null;
  designationProvider: string | null;
  designationProvenance: string | null;
  modelTier: string | null;
  availabilityScore: number | null;
  confidence: number | null;
  weekly: number | null;
  dynasty: number | null;
}

function fieldState(v: unknown): { value: string | null; provider: string | null; provenance: string | null } {
  if (!v || typeof v !== 'object') return { value: null, provider: null, provenance: null };
  const o = v as Record<string, unknown>;
  if (o.present !== true) return { value: null, provider: null, provenance: null };
  return {
    value: typeof o.value === 'string' ? o.value : null,
    provider: typeof o.provider === 'string' ? o.provider : null,
    provenance: typeof o.provenance === 'string' ? o.provenance : null,
  };
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * The availability component score, which is where an injury designation lands.
 *
 * Read from the accessible model's own published components rather than recomputed, so the
 * report cannot disagree with the model. The frozen QB engine does not publish a comparable
 * component, so QB reports null here and is covered by the composite columns instead.
 */
function availabilityOf(envelope: Record<string, unknown>): number | null {
  const a = envelope.accessible_model as Record<string, unknown> | null | undefined;
  if (!a) return null;
  const c = a.components as Record<string, unknown> | undefined;
  if (!c) return null;
  return num(c.AV);
}

function read(dbPath: string): Map<string, Row> {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const out = new Map<string, Row>();
  const inputs = new Map<string, Record<string, unknown>>();
  for (const r of db.prepare('select canonical_id, serialized from normalized_input_artifact').all() as {
    canonical_id: string;
    serialized: string;
  }[]) {
    inputs.set(r.canonical_id, JSON.parse(r.serialized) as Record<string, unknown>);
  }
  for (const r of db.prepare('select serialized from inference_output_artifact').all() as { serialized: string }[]) {
    const e = JSON.parse(r.serialized) as Record<string, unknown>;
    const id = String(e.player_id ?? '');
    if (id === '') continue;
    const input = inputs.get(id);
    const player = (input?.player ?? {}) as Record<string, unknown>;
    const status = fieldState(player.status);
    const designation = fieldState(player.injury_designation);
    const engine = (e.engine_output ?? null) as Record<string, unknown> | null;
    const accessible = (e.accessible_model ?? null) as Record<string, unknown> | null;
    const tier = typeof e.model_tier === 'string' ? e.model_tier : null;
    // Composites come from the model the tier names, matching what the board publishes.
    const comp = (
      tier === 'ACCESSIBLE' && accessible
        ? (accessible.composites as Record<string, unknown> | undefined)
        : tier === 'INSUFFICIENT'
          ? undefined
          : ((engine?.composites as Record<string, unknown> | undefined) ??
             (accessible?.composites as Record<string, unknown> | undefined))
    ) ?? {};
    const identity = (player.identity ?? {}) as Record<string, unknown>;
    out.set(id, {
      canonicalId: id,
      position: String(e.position ?? ''),
      name: String(identity.name_normalized ?? engine?.player_name ?? ''),
      status: status.value,
      statusProvider: status.provider,
      statusProvenance: status.provenance,
      designation: designation.value,
      designationProvider: designation.provider,
      designationProvenance: designation.provenance,
      modelTier: tier,
      availabilityScore: availabilityOf(e),
      confidence: num(e.published_confidence_score),
      weekly: num(comp.weekly ?? comp.WEEKLY),
      dynasty: num(comp.dynasty ?? comp.DYNASTY),
    });
  }
  db.close();
  return out;
}

/**
 * What an `inactive` player turned out to be once Sleeper answered.
 *
 * `unresolved` is its own bucket and is never folded into "genuinely unrostered": Sleeper not
 * carrying a player is a gap in the join, not evidence about his health.
 */
function classify(after: Row): 'injured/unavailable' | 'active/rostered' | 'genuinely unrostered' | 'unresolved' {
  if (after.designation !== null) return 'injured/unavailable';
  if (after.status === 'active') return 'active/rostered';
  if (after.status === 'inactive') {
    // Sleeper attested this player's status, and it was still inactive with no designation.
    return after.statusProvider === 'sleeper' ? 'genuinely unrostered' : 'unresolved';
  }
  return 'unresolved';
}

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`;
}

function summarize(values: readonly number[]): string {
  if (values.length === 0) return 'no movement';
  const abs = values.map(Math.abs).sort((a, b) => a - b);
  const mean = abs.reduce((s, x) => s + x, 0) / abs.length;
  return `n=${values.length} mean|Δ|=${mean.toFixed(2)} median|Δ|=${(abs[abs.length >> 1] as number).toFixed(2)} max|Δ|=${(abs[abs.length - 1] as number).toFixed(2)}`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const before = read(args.baseline);
  const after = read(args.enriched);

  const shared = [...after.keys()].filter((k) => before.has(k));
  const onlyBefore = [...before.keys()].filter((k) => !after.has(k));
  const onlyAfter = [...after.keys()].filter((k) => !before.has(k));

  // 1. Players enriched — a designation or a status Sleeper itself attested.
  const enriched = shared.filter((k) => {
    const a = after.get(k) as Row;
    const b = before.get(k) as Row;
    return (
      (a.designation !== null && b.designation === null) ||
      (a.statusProvider === 'sleeper' && b.statusProvider !== 'sleeper')
    );
  });

  // 2. inactive breakdown, before vs after.
  const inactiveBefore = shared.filter((k) => (before.get(k) as Row).status === 'inactive');
  const buckets: Record<string, string[]> = {
    'injured/unavailable': [],
    'active/rostered': [],
    'genuinely unrostered': [],
    unresolved: [],
  };
  for (const k of inactiveBefore) (buckets[classify(after.get(k) as Row)] as string[]).push(k);

  // 3/4. Composite movement, split by horizon and position.
  const delta = (k: string, key: 'weekly' | 'dynasty'): number | null => {
    const a = (after.get(k) as Row)[key];
    const b = (before.get(k) as Row)[key];
    return a === null || b === null ? null : a - b;
  };
  const moved = (key: 'weekly' | 'dynasty', ks: readonly string[]) =>
    ks.map((k) => delta(k, key)).filter((d): d is number => d !== null && Math.abs(d) > 1e-9);

  // 5. Provenance of every enriched availability field.
  const provenance = new Map<string, number>();
  for (const k of enriched) {
    const a = after.get(k) as Row;
    const key = `status=${a.statusProvenance ?? 'absent'}/${a.statusProvider ?? '-'} designation=${a.designationProvenance ?? 'absent'}/${a.designationProvider ?? '-'}`;
    provenance.set(key, (provenance.get(key) ?? 0) + 1);
  }

  const report = {
    baseline: args.baseline,
    enriched: args.enriched,
    publicationCounts: { before: before.size, after: after.size, onlyBefore: onlyBefore.length, onlyAfter: onlyAfter.length },
    playersEnriched: enriched.length,
    inactiveBefore: inactiveBefore.length,
    inactiveBreakdown: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
    weeklyMovement: summarize(moved('weekly', shared)),
    dynastyMovement: summarize(moved('dynasty', shared)),
    dynastyMovedByPosition: Object.fromEntries(
      ['QB', 'RB', 'WR', 'TE'].map((p) => [p, summarize(moved('dynasty', shared.filter((k) => (after.get(k) as Row).position === p)))]),
    ),
    weeklyMovedByPosition: Object.fromEntries(
      ['QB', 'RB', 'WR', 'TE'].map((p) => [p, summarize(moved('weekly', shared.filter((k) => (after.get(k) as Row).position === p)))]),
    ),
    confidenceMovement: summarize(
      shared
        .map((k) => {
          const a = (after.get(k) as Row).confidence;
          const b = (before.get(k) as Row).confidence;
          return a === null || b === null ? null : a - b;
        })
        .filter((d): d is number => d !== null && Math.abs(d) > 1e-9),
    ),
    availabilityProvenance: Object.fromEntries(provenance),
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`baseline  ${args.baseline}`);
  console.log(`enriched  ${args.enriched}`);
  console.log('');
  console.log('=== 1. PUBLICATION COUNTS ===');
  console.log(`  before ${before.size}   after ${after.size}`);
  console.log(`  present only before: ${onlyBefore.length}   only after: ${onlyAfter.length}`);
  if (onlyBefore.length > 0) console.log('  WARNING: a player disappeared. Enrichment must never remove a player.');
  console.log('');
  console.log('=== 2. PLAYERS ENRICHED ===');
  console.log(`  ${enriched.length} of ${shared.length} (${pct(enriched.length, shared.length)}) gained a Sleeper-attested status or designation`);
  console.log('');
  console.log(`=== 3. "inactive" BREAKDOWN (${inactiveBefore.length} players before) ===`);
  for (const [k, v] of Object.entries(buckets)) {
    console.log(`  ${k.padEnd(22)} ${String(v.length).padStart(4)}  ${pct(v.length, inactiveBefore.length)}`);
  }
  console.log('');
  console.log('=== 4. VALUE MOVEMENT ===');
  console.log(`  weekly   ${report.weeklyMovement}`);
  console.log(`  dynasty  ${report.dynastyMovement}`);
  console.log('  dynasty by position:');
  for (const [p, v] of Object.entries(report.dynastyMovedByPosition)) console.log(`    ${p}  ${v}`);
  console.log('  weekly by position:');
  for (const [p, v] of Object.entries(report.weeklyMovedByPosition)) console.log(`    ${p}  ${v}`);
  console.log('');
  console.log('=== 5. CONFIDENCE MOVEMENT ===');
  console.log(`  ${report.confidenceMovement}`);
  console.log('');
  console.log('=== 6. AVAILABILITY PROVENANCE (enriched players) ===');
  for (const [k, v] of Object.entries(report.availabilityProvenance)) console.log(`  ${String(v).padStart(4)}  ${k}`);
  if (Object.keys(report.availabilityProvenance).length === 0) {
    console.log('  none — Sleeper supplied nothing. If that was unexpected, run npm run verify:sleeper.');
  }
}

main();
