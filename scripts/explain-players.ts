/**
 * Explain named players' valuations across several runs, from the runs' own persisted artifacts.
 *
 *   npm run explain:players -- --run L0=<dir> --run L3=<dir> --player "brock purdy" ... --out <file.json>
 *
 * Each <dir> holds the run database (pt.db) and its export (export/board.json). For each player
 * and run this reports, without recomputing any valuation:
 *   - published overall rank, position rank, dynasty value, model tier
 *   - the dynasty composite and each component's weighted CONTRIBUTION to it
 *     (weight x score / sum of weights of the non-null components, the models' own rule)
 *   - the inputs behind it: age, seasons completed, draft round, team, roster/injury state,
 *     evidence windows, QB role/start evidence, missing inputs and substitutions
 *   - position compression: the dynasty-composite spread across the 10 position ranks around it
 *
 * Weights are imported from the models, so a contribution can never use a different weight
 * from the one that produced the score.
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HORIZON_WEIGHTS as QB_WEIGHTS } from '@/qb-model/constants';
import { RB_HORIZON_WEIGHTS } from '@/accessible/rb';
import { TE_HORIZON_WEIGHTS } from '@/accessible/te';
import { WR_HORIZON_WEIGHTS } from '@/accessible/wr';

type Rec = Record<string, any>;

const QB_KEYS: Record<string, string> = {
  PO: 'passing_opportunity', PQ: 'passing_quality', RV: 'rushing_value', SE: 'scoring_environment',
  RS: 'role_security', AV: 'availability', AD: 'age_development', SU: 'sustainability',
};

function contributions(position: string, comps: Record<string, number | null>): Record<string, { score: number | null; weight: number; contribution: number | null }> {
  const weights: Record<string, number> =
    position === 'QB'
      ? Object.fromEntries(Object.entries(QB_WEIGHTS.DYNASTY).map(([k, w]) => [QB_KEYS[k], w]))
      : { ...(position === 'RB' ? RB_HORIZON_WEIGHTS : position === 'TE' ? TE_HORIZON_WEIGHTS : WR_HORIZON_WEIGHTS).dynasty };
  const live = Object.entries(weights).filter(([k, w]) => w > 0 && typeof comps[k] === 'number');
  const total = live.reduce((s, [, w]) => s + w, 0);
  return Object.fromEntries(
    Object.entries(weights).map(([k, w]) => {
      const score = typeof comps[k] === 'number' ? (comps[k] as number) : null;
      return [k, { score, weight: w, contribution: score === null || w <= 0 || total === 0 ? null : (score * w) / total }];
    }),
  );
}

interface RunData { board: Map<string, Rec>; byName: Map<string, { input: Rec; output: Rec; canonicalId: string }>; positionComposites: Map<string, number[]> }

function loadRun(dir: string): RunData {
  const db = new DatabaseSync(join(dir, 'pt.db'), { readOnly: true });
  const pub = db.prepare('SELECT run_id FROM current_publication c JOIN publication p ON p.publication_id = c.publication_id').get() as { run_id: string };
  const rows = db
    .prepare(`SELECT r.canonical_id, n.serialized ni, o.serialized out FROM run_inference r
              JOIN normalized_input_artifact n ON n.checksum = r.normalized_input_checksum
              JOIN inference_output_artifact o ON o.checksum = r.output_checksum WHERE r.run_id = ?`)
    .all(pub.run_id) as { canonical_id: string; ni: string; out: string }[];
  const board = JSON.parse(readFileSync(join(dir, 'export', 'board.json'), 'utf8')) as { entries: Rec[] };
  const byName = new Map<string, { input: Rec; output: Rec; canonicalId: string }>();
  for (const r of rows) {
    const input = JSON.parse(r.ni);
    byName.set(String(input.player.full_name.value), { input, output: JSON.parse(r.out), canonicalId: r.canonical_id });
  }
  const positionComposites = new Map<string, number[]>();
  for (const e of board.entries) {
    const d = e.composites?.dynasty;
    if (typeof d !== 'number' || e.dynastyPositionRank == null) continue;
    const arr = positionComposites.get(e.position) ?? [];
    arr[e.dynastyPositionRank - 1] = d;
    positionComposites.set(e.position, arr);
  }
  return { board: new Map(board.entries.map((e) => [e.canonicalId, e])), byName, positionComposites };
}

function value(field: Rec | undefined): unknown {
  return field && field.present ? field.value : null;
}

function explain(run: RunData, name: string): Rec | null {
  const hit = run.byName.get(name);
  if (!hit) return null;
  const { input, output, canonicalId } = hit;
  const entry = run.board.get(canonicalId) ?? {};
  const p = input.player;
  const acc = output.accessible_model;
  const eng = output.engine_output;
  const comps: Record<string, number | null> = acc ? acc.components : eng ? eng.components : {};
  const position = String(p.position);
  const prod = input.evidence?.production;
  const posRank: number | null = entry.dynastyPositionRank ?? null;
  const arr = run.positionComposites.get(position) ?? [];
  const window = posRank === null ? null : arr.slice(Math.max(0, posRank - 6), posRank + 5).filter((x) => typeof x === 'number');
  return {
    overallRank: entry.dynastyOverallRank ?? null,
    positionRank: posRank,
    dynastyValue: entry.dynastyValue ?? null,
    dynastyValueSource: entry.dynastyValueSource ?? null,
    modelTier: output.model_tier,
    status: output.status,
    insufficientReason: output.accessible_insufficient?.reason ?? output.tier_not_attempted_reason ?? null,
    dynastyComposite: acc ? acc.composites.dynasty : eng ? eng.composites.dynasty : null,
    contributions: contributions(position, comps),
    inputs: {
      age: value(p.age), seasonsCompleted: value(p.nfl_seasons_completed), draftRound: value(p.draft_round),
      team: value(p.team), status: value(p.status), injuryDesignation: value(p.injury_designation),
      gamesObserved: acc?.provenance?.gamesObserved ?? input.facts?.career_games_played ?? null,
      seasonsObserved: acc?.provenance?.seasonsObserved ?? null,
      roleWindow: prod?.roleWindow ?? null,
      latestSeason: prod?.latestSeason ?? null,
      priorSeason: prod?.priorSeason ?? null,
      providerTargetShare: prod?.providerTargetShare ?? null,
      teamShares: prod?.teamShares ?? null,
      rosteredTeamWeeks: prod?.rosteredTeamWeeks ?? null,
      qbRole: input.evidence?.qbRole ?? null,
      qbMerged: eng ? {
        role_status: output.merged_supplement?.role_status, depth_chart_status: output.merged_supplement?.depth_chart_status,
        injury_status: output.merged_supplement?.injury_status, probability_active: output.merged_supplement?.probability_active,
        recent_starts: output.merged_supplement?.recent_starts, career_starts: output.merged_supplement?.career_starts,
      } : null,
      recentFacts: eng ? Object.fromEntries(Object.entries(input.facts ?? {}).filter(([k]) => k.startsWith('recent_') || k.startsWith('career_'))) : null,
    },
    missing: {
      materialMissingInputs: acc?.materialMissingInputs ?? [],
      confidencePenalties: acc?.confidence?.penaltyCodes ?? [],
      engineFallbacks: eng?.fallback_log?.length ?? null,
      readinessMissing: output.readiness_missing ?? [],
    },
    positionCompression: window && window.length > 1 ? { ranksCompared: window.length, compositeSpread: Math.max(...window) - Math.min(...window) } : null,
  };
}

function main(): number {
  const runs: [string, string][] = [];
  const players: string[] = [];
  let out: string | null = null;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--run') { const [k, v] = argv[++i].split('='); runs.push([k, resolve(v)]); }
    else if (argv[i] === '--player') players.push(argv[++i].toLowerCase());
    else if (argv[i] === '--out') out = resolve(argv[++i]);
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  for (const [, d] of runs) if (!existsSync(join(d, 'pt.db'))) throw new Error(`no pt.db in ${d}`);
  const loaded = runs.map(([k, d]) => [k, loadRun(d)] as const);
  const report = Object.fromEntries(players.map((n) => [n, Object.fromEntries(loaded.map(([k, r]) => [k, explain(r, n)]))]));
  const text = JSON.stringify(report, null, 2);
  if (out) writeFileSync(out, `${text}\n`);
  else console.log(text);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
