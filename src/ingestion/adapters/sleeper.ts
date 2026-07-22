// sleeper-shaped reference adapter (Phase 4 §2). Normalizes already-fetched raw rows.
// Advertises identity + injury + depth-chart + transaction capabilities. Its player
// ids differ from nflverse (sleeper_id); identity resolution joins the two.

import type { ProviderAdapter, NormalizeResult } from '../capabilities';
import {
  normalizeInjuryStatus,
  normalizePosition,
  normalizePractice,
  normalizeStatus,
  normalizeTeam,
  normalizeTimestamp,
} from '../ordering';
import type {
  Capability,
  DepthChartRecord,
  FreshnessMeta,
  IngestionWarning,
  InjuryRecord,
  PlayerRecord,
  TransactionRecord,
} from '../types';
import { asRows, num, str } from './helpers';

const CAPS = new Set<Capability>(['identity', 'injuries', 'depthCharts', 'transactions']);

function ref(sleeperId: string | null): { key: string; value: string } | null {
  return sleeperId ? { key: 'sleeper', value: sleeperId } : null;
}

export const sleeperAdapter: ProviderAdapter = {
  provider: 'sleeper',
  capabilities: CAPS,

  normalizeIdentity(raw: unknown, freshness: FreshnessMeta): NormalizeResult<PlayerRecord> {
    const records: PlayerRecord[] = [];
    const warnings: IngestionWarning[] = [];
    for (const row of asRows(raw)) {
      const sleeperId = str(row, 'sleeper_id') ?? str(row, 'player_id');
      const name = str(row, 'full_name') ?? str(row, 'name');
      const r = ref(sleeperId);
      if (!r || !name) {
        warnings.push({ code: 'DISCARDED_MALFORMED', provider: 'sleeper', detail: 'identity row missing sleeper_id or name' });
        continue;
      }
      const pos = normalizePosition(str(row, 'position'));
      if (str(row, 'position') && pos === null) {
        warnings.push({ code: 'UNSUPPORTED_POSITION', provider: 'sleeper', detail: `${sleeperId}: ${String(row.position)}` });
      }
      const providerIds: Record<string, string> = { sleeper: r.value };
      const gsis = str(row, 'gsis_id');
      if (gsis) providerIds.gsis = gsis; // cross-id link enables join with nflverse
      records.push({
        canonicalId: null, providerRef: r, freshness, sourceTimestamp: freshness.effectiveDate,
        providerIds, nameNormalized: name.toLowerCase(), position: pos, team: normalizeTeam(str(row, 'team')),
        age: num(row, 'age'), nflSeasonsCompleted: num(row, 'years_exp'), draftRound: num(row, 'draft_round'),
        status: normalizeStatus(str(row, 'status')), injuryDesignation: str(row, 'injury_status'),
      });
    }
    return { records, warnings };
  },

  normalizeInjuries(raw: unknown, freshness: FreshnessMeta): NormalizeResult<InjuryRecord> {
    const records: InjuryRecord[] = [];
    const warnings: IngestionWarning[] = [];
    for (const row of asRows(raw)) {
      const sleeperId = str(row, 'sleeper_id');
      const r = ref(sleeperId);
      if (!r) {
        warnings.push({ code: 'DISCARDED_MALFORMED', provider: 'sleeper', detail: 'injury row missing sleeper_id' });
        continue;
      }
      const inj = normalizeInjuryStatus(str(row, 'injury_status'));
      if (!inj.known) warnings.push({ code: 'UNKNOWN_ENUM', provider: 'sleeper', detail: `injury_status ${String(row.injury_status)}` });
      records.push({ canonicalId: null, providerRef: r, freshness, sourceTimestamp: freshness.effectiveDate, injuryStatus: inj.value, practiceStatus: normalizePractice(str(row, 'practice_status')) });
    }
    return { records, warnings };
  },

  normalizeDepthCharts(raw: unknown, freshness: FreshnessMeta): NormalizeResult<DepthChartRecord> {
    const records: DepthChartRecord[] = [];
    const warnings: IngestionWarning[] = [];
    for (const row of asRows(raw)) {
      const sleeperId = str(row, 'sleeper_id');
      const team = normalizeTeam(str(row, 'team'));
      const pos = normalizePosition(str(row, 'position'));
      const rank = num(row, 'depth');
      const r = ref(sleeperId);
      if (!r || !team || pos === null || rank === null) {
        warnings.push({ code: 'DISCARDED_MALFORMED', provider: 'sleeper', detail: 'depth-chart row incomplete/unsupported position' });
        continue;
      }
      records.push({ canonicalId: null, providerRef: r, freshness, sourceTimestamp: freshness.effectiveDate, team, position: pos, rank });
    }
    return { records, warnings };
  },

  normalizeTransactions(raw: unknown, freshness: FreshnessMeta): NormalizeResult<TransactionRecord> {
    const records: TransactionRecord[] = [];
    const warnings: IngestionWarning[] = [];
    const valid = ['SIGN', 'TRADE_IN', 'TRADE_OUT', 'WAIVE', 'ACTIVATE', 'IR', 'BENCH', 'SUSPEND'];
    for (const row of asRows(raw)) {
      const sleeperId = str(row, 'sleeper_id');
      const dateRaw = str(row, 'date');
      const typeRaw = (str(row, 'type') ?? '').toUpperCase();
      const r = ref(sleeperId);
      if (!r || !dateRaw || !valid.includes(typeRaw)) {
        if (r && dateRaw && typeRaw) warnings.push({ code: 'UNKNOWN_ENUM', provider: 'sleeper', detail: `txn type ${typeRaw}` });
        else warnings.push({ code: 'DISCARDED_MALFORMED', provider: 'sleeper', detail: 'transaction row incomplete' });
        continue;
      }
      let date: string;
      try {
        date = normalizeTimestamp(dateRaw);
      } catch {
        warnings.push({ code: 'MISSING_TIMESTAMP', provider: 'sleeper', detail: `bad date ${dateRaw}` });
        continue;
      }
      records.push({ canonicalId: null, providerRef: r, freshness, sourceTimestamp: date, type: typeRaw as TransactionRecord['type'], team: normalizeTeam(str(row, 'team')), date });
    }
    return { records, warnings };
  },
};
