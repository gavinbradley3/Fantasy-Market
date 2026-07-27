// Release discovery + asset resolution tests. Pure — no network.

import { describe, expect, it } from 'vitest';
import {
  assetPath,
  manifestPath,
  NFLVERSE_ALSO_NORMALIZES,
  NFLVERSE_RELEASES,
  parseReleaseStamp,
  readReleaseManifest,
} from './nflverseReleases';

describe('release/asset resolution', () => {
  it('resolves each capability to the release nflverse actually publishes', () => {
    expect(assetPath(NFLVERSE_RELEASES.identity!, '')).toBe('/players/players.csv');
    expect(assetPath(NFLVERSE_RELEASES.schedule!, '')).toBe('/schedules/games.csv');
    expect(assetPath(NFLVERSE_RELEASES.games!, '2025')).toBe('/stats_player/stats_player_week_2025.csv');
    expect(assetPath(NFLVERSE_RELEASES.roster!, '2025')).toBe('/weekly_rosters/roster_weekly_2025.csv');
    expect(assetPath(NFLVERSE_RELEASES.participation!, '2025')).toBe('/pbp_participation/pbp_participation_2025.csv');
    expect(manifestPath('stats_player')).toBe('/stats_player/timestamp.json');
  });

  it('uses the current stats release, not the retired one', () => {
    // `player_stats` stopped being rebuilt after 2024 and has no file for later seasons.
    expect(NFLVERSE_RELEASES.games!.tag).toBe('stats_player');
  });

  it('marks exactly the per-season datasets as season scoped', () => {
    expect(NFLVERSE_RELEASES.identity!.seasonScoped).toBe(false);
    expect(NFLVERSE_RELEASES.schedule!.seasonScoped).toBe(false);
    expect(NFLVERSE_RELEASES.games!.seasonScoped).toBe(true);
    expect(NFLVERSE_RELEASES.roster!.seasonScoped).toBe(true);
    expect(NFLVERSE_RELEASES.participation!.seasonScoped).toBe(true);
  });

  it('declares no release for capabilities nflverse does not publish', () => {
    // An explicit UNSUPPORTED_CAPABILITY beats a declared path that 404s: the first says
    // "this provider has no such data", the second reads like an outage.
    for (const capability of ['injuries', 'transactions', 'depthCharts', 'projections', 'team'] as const) {
      expect(NFLVERSE_RELEASES[capability]).toBeUndefined();
    }
  });

  it('routes officialStarts through the schedules payload rather than a second fetch', () => {
    expect(NFLVERSE_RELEASES.officialStarts).toBeUndefined();
    expect(NFLVERSE_ALSO_NORMALIZES.schedule).toEqual(['officialStarts']);
  });
});

describe('release stamp parsing', () => {
  it('reads the provider stamp in both US-Eastern offsets', () => {
    expect(parseReleaseStamp('2026-07-27 07:17:28 EDT')).toBe('2026-07-27T11:17:28.000Z');
    expect(parseReleaseStamp('2026-02-10 13:54:06 EST')).toBe('2026-02-10T18:54:06.000Z');
  });

  it('accepts an explicit UTC stamp and a bare timestamp', () => {
    expect(parseReleaseStamp('2026-02-10 13:54:06 UTC')).toBe('2026-02-10T13:54:06.000Z');
    expect(parseReleaseStamp('2026-02-10T13:54:06')).toBe('2026-02-10T13:54:06.000Z');
  });

  it('returns null rather than guessing at an unrecognised zone or a bad shape', () => {
    // Inventing an instant the provider never stated would be worse than reporting none.
    expect(parseReleaseStamp('2026-02-10 13:54:06 PST')).toBeNull();
    expect(parseReleaseStamp('yesterday')).toBeNull();
    expect(parseReleaseStamp('2026-13-10 13:54:06 EST')).toBeNull();
    expect(parseReleaseStamp('2026-02-30 13:54:06 EST')).toBeNull();
  });
});

describe('release manifest reading', () => {
  it('keeps the provider version verbatim alongside the parsed instant', () => {
    expect(readReleaseManifest('{"last_updated":"2026-07-27 07:17:28 EDT"}')).toEqual({
      sourceVersion: '2026-07-27 07:17:28 EDT',
      sourceLastUpdated: '2026-07-27T11:17:28.000Z',
    });
  });

  it('keeps an unparseable stamp as the opaque version with no instant', () => {
    expect(readReleaseManifest('{"last_updated":"build 42"}')).toEqual({
      sourceVersion: 'build 42',
      sourceLastUpdated: null,
    });
  });

  it('returns null for a manifest carrying no usable version', () => {
    expect(readReleaseManifest('not json')).toBeNull();
    expect(readReleaseManifest('{}')).toBeNull();
    expect(readReleaseManifest('{"last_updated":"  "}')).toBeNull();
    expect(readReleaseManifest('null')).toBeNull();
  });
});
