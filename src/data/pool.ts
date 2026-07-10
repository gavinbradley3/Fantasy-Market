// The authored mock player pool (§28). Real player names are used factually
// (§15.4) with clearly-labeled fictional mock values — no logos, marks, or
// headshots anywhere. Every stat line is mock (`isMock: true`).
//
// These seeds are ENGINE INPUTS, not outputs: sub-scores (§12.1) plus a target
// mispricing and authored catalysts. The engine (services/marketEngine) turns
// them into prices, signals, tags, classes, and history. If a chart looks wrong,
// the fix is here or in the engine — never in generated JSON (§40.4).

import type { CatalystDirection, CatalystMagnitude, Position } from '@/types/market';

export interface SeedCatalyst {
  daysAgo: number;
  type: string;
  dir: CatalystDirection;
  mag: CatalystMagnitude;
  headline: string;
  detail: string;
  affects: string[];
}

export interface PlayerSeed {
  /**
   * Permanent canonical id (system of record, DESIGN §27). Authored literal —
   * NEVER derived from array position. Never renumber, never reuse. New players
   * get the next unused number regardless of where they sit in this file.
   */
  id: string;
  ticker: string;
  name: string;
  pos: Position;
  team: string;
  /** External provider ids — optional, unique when present (validated). */
  sleeperId?: string;
  gsisId?: string;
  age: number;
  exp: number;
  rookie?: boolean;
  status?: string; // active | questionable | ir_short | ir_long | suspended
  // Fundamental sub-scores (0–100).
  prod: number;
  usage: number;
  opp: number;
  eff: number;
  role: number;
  off: number;
  // Structural inputs.
  td: number; // TD dependence
  inj: number; // injury history
  hype: number;
  games: number; // games played (sample size)
  // Target base mispricing at dyn_sf_half (drives derived sentiment). Format
  // changes shift fundamentals and therefore mispricing naturally from here.
  mis: number;
  cats?: SeedCatalyst[];
}

// Concise catalyst authoring helper.
const cat = (
  daysAgo: number,
  type: string,
  dir: CatalystDirection,
  mag: CatalystMagnitude,
  headline: string,
  detail: string,
  affects: string[],
): SeedCatalyst => ({ daysAgo, type, dir, mag, headline, detail, affects });

export const POOL: PlayerSeed[] = [
  // ---------------- Elite anchors / Blue Chips ----------------
  {
    id: 'pt_0001',
    ticker: 'JMC', name: "Ja'Marr Chase", pos: 'WR', team: 'CIN', age: 25, exp: 5,
    prod: 98, usage: 95, opp: 96, eff: 94, role: 96, off: 82, td: 40, inj: 20, hype: 60, games: 16, mis: 2,
    cats: [
      cat(9, 'target_share_change', 'bullish', 'minor', 'Target share holds at 31%', 'Route participation and target share remain elite; no crack in the profile.', ['opportunity', 'usage']),
    ],
  },
  {
    id: 'pt_0002',
    ticker: 'ALN', name: 'Josh Allen', pos: 'QB', team: 'BUF', age: 29, exp: 8,
    prod: 96, usage: 90, opp: 88, eff: 90, role: 98, off: 84, td: 30, inj: 22, hype: 55, games: 17, mis: -3,
    cats: [cat(20, 'role_security_improvement', 'bullish', 'minor', 'Rushing floor keeps SF QB1 tier intact', 'Designed-run volume protects the league-winning weekly floor in Superflex.', ['usage', 'roleSecurity'])],
  },
  {
    id: 'pt_0003',
    ticker: 'JJF', name: 'Justin Jefferson', pos: 'WR', team: 'MIN', age: 26, exp: 6,
    prod: 96, usage: 94, opp: 95, eff: 93, role: 94, off: 74, td: 42, inj: 30, hype: 58, games: 15, mis: 6,
    cats: [cat(14, 'efficiency_spike', 'bullish', 'moderate', 'Yards-per-route-run back to elite tier', 'Efficiency rebounded toward career norms; quiet drift up on stable usage.', ['efficiency', 'production'])],
  },
  {
    id: 'pt_0004',
    ticker: 'BIJ', name: 'Bijan Robinson', pos: 'RB', team: 'ATL', age: 24, exp: 3,
    prod: 93, usage: 92, opp: 93, eff: 88, role: 92, off: 72, td: 38, inj: 24, hype: 72, games: 17, mis: -8,
    cats: [cat(11, 'hype_surge', 'bullish', 'moderate', 'Consensus RB1 hype lifts the price', 'Market has bid the price slightly ahead of an already-elite profile.', ['production'])],
  },
  {
    id: 'pt_0005',
    ticker: 'GIB', name: 'Jahmyr Gibbs', pos: 'RB', team: 'DET', age: 24, exp: 3,
    prod: 90, usage: 84, opp: 88, eff: 91, role: 82, off: 86, td: 46, inj: 26, hype: 66, games: 16, mis: 8,
    cats: [
      cat(7, 'red_zone_usage_change', 'bullish', 'moderate', 'Red-zone carry share climbed to 58%', 'Goal-line role expanded, lifting the touchdown projection and the model value.', ['opportunity', 'production']),
      cat(30, 'role_security_improvement', 'bullish', 'minor', 'Passing-down snaps trending up', 'Third-down usage rose, deepening the every-week floor.', ['usage', 'roleSecurity']),
    ],
  },
  {
    id: 'pt_0006',
    ticker: 'LMB', name: 'CeeDee Lamb', pos: 'WR', team: 'DAL', age: 26, exp: 6,
    prod: 92, usage: 93, opp: 92, eff: 86, role: 92, off: 70, td: 40, inj: 24, hype: 56, games: 16, mis: 3,
  },
  {
    id: 'pt_0007',
    ticker: 'HRT', name: 'Amon-Ra St. Brown', pos: 'WR', team: 'DET', age: 26, exp: 5,
    prod: 91, usage: 92, opp: 90, eff: 88, role: 93, off: 86, td: 38, inj: 18, hype: 50, games: 16, mis: 4,
  },
  {
    id: 'pt_0008',
    ticker: 'LMR', name: 'Lamar Jackson', pos: 'QB', team: 'BAL', age: 28, exp: 8,
    prod: 95, usage: 92, opp: 86, eff: 92, role: 96, off: 82, td: 32, inj: 34, hype: 58, games: 16, mis: -2,
  },
  {
    id: 'pt_0009',
    ticker: 'MHM', name: 'Patrick Mahomes', pos: 'QB', team: 'KC', age: 30, exp: 9,
    prod: 90, usage: 86, opp: 84, eff: 90, role: 97, off: 80, td: 30, inj: 20, hype: 52, games: 17, mis: -4,
  },
  {
    id: 'pt_0010',
    ticker: 'NAB', name: 'Malik Nabers', pos: 'WR', team: 'NYG', age: 23, exp: 2,
    status: 'questionable',
    prod: 84, usage: 92, opp: 93, eff: 84, role: 90, off: 40, td: 34, inj: 58, hype: 62, games: 14, mis: 14,
    cats: [
      cat(3, 'injury_recovery', 'bullish', 'moderate', 'Cleared for full training camp participation', 'Removes the primary discount on the asset; the market has not fully repriced the clearance.', ['injury', 'roleSecurity']),
      cat(16, 'own_injury', 'bearish', 'major', 'Soft-tissue setback in OTAs', 'Triggered the 30-day slide; the market appears to have overcorrected on the news.', ['injury', 'production']),
      cat(40, 'offensive_line_change', 'bullish', 'minor', 'Offense adds interior line help', 'Environment score ticked up on improved protection.', ['offense']),
    ],
  },
  {
    id: 'pt_0011',
    ticker: 'BOW', name: 'Brock Bowers', pos: 'TE', team: 'LV', age: 22, exp: 2,
    prod: 86, usage: 88, opp: 84, eff: 82, role: 88, off: 52, td: 36, inj: 22, hype: 88, games: 17, mis: -18,
    cats: [
      cat(6, 'hype_surge', 'bearish', 'moderate', 'Price assumes a target ceiling route share doesn’t support', 'Elite young TE, but the market now pays for a role expansion that hasn’t happened yet.', ['production', 'opportunity']),
      cat(18, 'efficiency_spike', 'bullish', 'minor', 'Yards after catch spikes over three weeks', 'Short-term efficiency surge fed the hype cycle.', ['efficiency']),
    ],
  },
  {
    id: 'pt_0012',
    ticker: 'JTY', name: 'Ashton Jeanty', pos: 'RB', team: 'LV', age: 21, exp: 1, rookie: true,
    prod: 78, usage: 82, opp: 84, eff: 76, role: 84, off: 50, td: 40, inj: 24, hype: 80, games: 0, mis: 24,
    cats: [cat(15, 'rookie_competition_added', 'bullish', 'moderate', 'Named clear lead back out of camp', 'Landing spot and draft capital point to an immediate three-down role; the rookie discount looks steep.', ['opportunity', 'roleSecurity'])],
  },

  // ---------------- Strong starters (WR) ----------------
  { id: 'pt_0013', ticker: 'PUK', name: 'Puka Nacua', pos: 'WR', team: 'LAR', age: 24, exp: 3, prod: 89, usage: 90, opp: 88, eff: 86, role: 86, off: 70, td: 34, inj: 40, hype: 60, games: 14, mis: 6 },
  { id: 'pt_0014', ticker: 'GBW', name: 'Garrett Wilson', pos: 'WR', team: 'NYJ', age: 25, exp: 4, prod: 84, usage: 90, opp: 89, eff: 80, role: 88, off: 46, td: 30, inj: 22, hype: 54, games: 16, mis: 9, cats: [cat(12, 'qb_change', 'bullish', 'moderate', 'Upgrade under center lifts the ceiling', 'A stronger passing environment raises the projection after a quiet season.', ['offense', 'production'])] },
  { id: 'pt_0015', ticker: 'DVA', name: 'Drake London', pos: 'WR', team: 'ATL', age: 24, exp: 4, prod: 85, usage: 89, opp: 90, eff: 82, role: 88, off: 68, td: 32, inj: 20, hype: 55, games: 16, mis: 7 },
  { id: 'pt_0016', ticker: 'NAW', name: 'Nico Collins', pos: 'WR', team: 'HOU', age: 26, exp: 5, prod: 87, usage: 86, opp: 85, eff: 90, role: 87, off: 72, td: 40, inj: 44, hype: 52, games: 13, mis: 5 },
  { id: 'pt_0017', ticker: 'BTW', name: 'Brian Thomas Jr.', pos: 'WR', team: 'JAX', age: 23, exp: 2, prod: 84, usage: 84, opp: 86, eff: 88, role: 84, off: 54, td: 44, inj: 20, hype: 68, games: 16, mis: 10, cats: [cat(8, 'target_share_change', 'bullish', 'moderate', 'Emerges as clear alpha target', 'Second-year leap in target share underpins the breakout profile.', ['opportunity', 'usage'])] },
  { id: 'pt_0018', ticker: 'AJB', name: 'A.J. Brown', pos: 'WR', team: 'PHI', age: 28, exp: 7, prod: 88, usage: 84, opp: 84, eff: 88, role: 86, off: 78, td: 36, inj: 42, hype: 50, games: 14, mis: 2 },
  { id: 'pt_0019', ticker: 'TYH', name: 'Tyreek Hill', pos: 'WR', team: 'MIA', age: 31, exp: 10, prod: 82, usage: 84, opp: 82, eff: 84, role: 82, off: 60, td: 40, inj: 40, hype: 48, games: 15, mis: -10, cats: [cat(10, 'age_curve_milestone', 'bearish', 'moderate', 'Age-curve pressure enters the price', 'Elite still, but the dynasty market now bakes in decline risk at 31.', ['production'])] },
  { id: 'pt_0020', ticker: 'DKM', name: 'DK Metcalf', pos: 'WR', team: 'PIT', age: 27, exp: 7, prod: 82, usage: 82, opp: 80, eff: 82, role: 84, off: 58, td: 42, inj: 24, hype: 46, games: 16, mis: -4 },
  { id: 'pt_0021', ticker: 'DBS', name: 'Davante Adams', pos: 'WR', team: 'LAR', age: 32, exp: 12, prod: 82, usage: 84, opp: 83, eff: 84, role: 82, off: 70, td: 44, inj: 30, hype: 44, games: 14, mis: -20, cats: [cat(9, 'age_curve_milestone', 'bearish', 'major', 'Name value runs ahead of the age curve', 'Production holds, but the price still asks buyers to pay for the prime years.', ['production'])] },
  { id: 'pt_0022', ticker: 'MRH', name: 'Marvin Harrison Jr.', pos: 'WR', team: 'ARI', age: 23, exp: 2, prod: 80, usage: 84, opp: 86, eff: 76, role: 86, off: 58, td: 34, inj: 20, hype: 74, games: 16, mis: -6, cats: [cat(13, 'hype_surge', 'bearish', 'minor', 'Sophomore hype outpaces the target share', 'Pedigree keeps sentiment high while usage still has room to grow.', ['opportunity'])] },
  { id: 'pt_0023', ticker: 'RCE', name: 'Rome Odunze', pos: 'WR', team: 'CHI', age: 23, exp: 2, prod: 74, usage: 80, opp: 82, eff: 78, role: 80, off: 56, td: 30, inj: 20, hype: 62, games: 16, mis: 8, cats: [cat(6, 'role_spike', 'bullish', 'moderate', 'Slot-plus-boundary role expands', 'A wider route tree points to a second-year usage jump.', ['usage', 'opportunity'])] },
  { id: 'pt_0024', ticker: 'JSS', name: 'Jaxon Smith-Njigba', pos: 'WR', team: 'SEA', age: 23, exp: 3, prod: 83, usage: 86, opp: 85, eff: 84, role: 86, off: 62, td: 30, inj: 18, hype: 56, games: 17, mis: 7 },
  { id: 'pt_0025', ticker: 'LDN', name: 'Ladd McConkey', pos: 'WR', team: 'LAC', age: 24, exp: 2, prod: 80, usage: 84, opp: 82, eff: 86, role: 84, off: 64, td: 30, inj: 22, hype: 54, games: 16, mis: 5 },
  { id: 'pt_0026', ticker: 'TMC', name: 'Terry McLaurin', pos: 'WR', team: 'WAS', age: 30, exp: 7, prod: 82, usage: 82, opp: 82, eff: 82, role: 84, off: 66, td: 42, inj: 24, hype: 42, games: 16, mis: -6 },
  { id: 'pt_0027', ticker: 'MPT', name: 'Mike Evans', pos: 'WR', team: 'TB', age: 32, exp: 12, prod: 82, usage: 78, opp: 78, eff: 84, role: 82, off: 68, td: 52, inj: 34, hype: 42, games: 14, mis: -16, cats: [cat(11, 'unsustainable_td_rate', 'bearish', 'moderate', 'Touchdown rate sits well above expected', 'Elite red-zone output is unlikely to fully repeat; regression risk priced light.', ['efficiency', 'production'])] },
  { id: 'pt_0028', ticker: 'CGB', name: 'Chris Godwin', pos: 'WR', team: 'TB', age: 29, exp: 8, status: 'questionable', prod: 78, usage: 82, opp: 82, eff: 80, role: 80, off: 68, td: 30, inj: 60, hype: 44, games: 7, mis: 16, cats: [cat(5, 'injury_recovery', 'bullish', 'moderate', 'Ahead of schedule in rehab', 'A cheaper injury-discounted price on a proven target earner.', ['injury'])] },
  { id: 'pt_0029', ticker: 'DSM', name: 'DeVonta Smith', pos: 'WR', team: 'PHI', age: 27, exp: 5, prod: 80, usage: 80, opp: 80, eff: 84, role: 84, off: 78, td: 34, inj: 22, hype: 44, games: 16, mis: 0 },
  { id: 'pt_0030', ticker: 'ZAF', name: 'Zay Flowers', pos: 'WR', team: 'BAL', age: 25, exp: 3, prod: 80, usage: 82, opp: 82, eff: 82, role: 82, off: 82, td: 30, inj: 20, hype: 50, games: 17, mis: 4 },
  { id: 'pt_0031', ticker: 'GEB', name: 'George Pickens', pos: 'WR', team: 'DAL', age: 24, exp: 4, prod: 76, usage: 78, opp: 78, eff: 82, role: 74, off: 70, td: 36, inj: 22, hype: 58, games: 16, mis: 3, cats: [cat(7, 'depth_chart_change', 'bullish', 'moderate', 'Clear WR2 role in a high-volume passing game', 'New environment stabilizes the target outlook.', ['opportunity', 'offense'])] },
  { id: 'pt_0032', ticker: 'JWN', name: 'Jameson Williams', pos: 'WR', team: 'DET', age: 24, exp: 4, prod: 74, usage: 68, opp: 70, eff: 88, role: 54, off: 86, td: 86, inj: 30, hype: 62, games: 15, mis: -6, cats: [cat(10, 'touchdown_bubble', 'bearish', 'moderate', 'Big-play rate props up the scoring line', 'Explosive but volatile; a weekly boom-bust profile that swings the value.', ['efficiency'])] },
  { id: 'pt_0033', ticker: 'CAK', name: 'Cooper Kupp', pos: 'WR', team: 'SEA', age: 32, exp: 9, prod: 74, usage: 78, opp: 78, eff: 80, role: 78, off: 62, td: 32, inj: 62, hype: 40, games: 12, mis: -14, cats: [cat(12, 'age_curve_milestone', 'bearish', 'moderate', 'Injury history and age compress the window', 'Still productive when healthy, but durability and age weigh on dynasty value.', ['injury', 'production'])] },
  { id: 'pt_0034', ticker: 'XWO', name: 'Xavier Worthy', pos: 'WR', team: 'KC', age: 22, exp: 2, prod: 74, usage: 78, opp: 80, eff: 82, role: 82, off: 82, td: 30, inj: 18, hype: 64, games: 16, mis: 28, cats: [cat(6, 'role_spike', 'bullish', 'major', 'Route share climbs in a premier offense', 'A second-year usage jump inside an elite passing attack; the market is slow to reprice it.', ['usage', 'opportunity'])] },
  { id: 'pt_0035', ticker: 'KEA', name: 'Keon Coleman', pos: 'WR', team: 'BUF', age: 22, exp: 2, prod: 68, usage: 74, opp: 76, eff: 74, role: 76, off: 82, td: 36, inj: 20, hype: 52, games: 15, mis: 6 },
  { id: 'pt_0036', ticker: 'JAD', name: 'Jaylen Waddle', pos: 'WR', team: 'MIA', age: 27, exp: 5, prod: 76, usage: 80, opp: 80, eff: 82, role: 80, off: 60, td: 30, inj: 30, hype: 42, games: 15, mis: -2 },
  { id: 'pt_0037', ticker: 'DEA', name: 'DJ Moore', pos: 'WR', team: 'CHI', age: 28, exp: 8, prod: 78, usage: 82, opp: 82, eff: 80, role: 82, off: 56, td: 32, inj: 20, hype: 42, games: 17, mis: -4 },
  { id: 'pt_0038', ticker: 'CAS', name: 'Calvin Ridley', pos: 'WR', team: 'TEN', age: 31, exp: 8, prod: 72, usage: 78, opp: 78, eff: 76, role: 78, off: 46, td: 34, inj: 30, hype: 38, games: 16, mis: -8 },

  // ---------------- Strong starters (RB) ----------------
  { id: 'pt_0039', ticker: 'SBY', name: 'Saquon Barkley', pos: 'RB', team: 'PHI', age: 28, exp: 8, prod: 92, usage: 88, opp: 90, eff: 90, role: 88, off: 82, td: 44, inj: 34, hype: 66, games: 16, mis: -6, cats: [cat(9, 'unsustainable_td_rate', 'bearish', 'minor', 'Historic TD volume unlikely to fully repeat', 'League-winning season bakes some regression risk into the price.', ['efficiency'])] },
  { id: 'pt_0040', ticker: 'CMC', name: 'Christian McCaffrey', pos: 'RB', team: 'SF', age: 29, exp: 9, status: 'questionable', prod: 88, usage: 86, opp: 90, eff: 88, role: 88, off: 76, td: 42, inj: 66, hype: 54, games: 9, mis: 12, cats: [cat(8, 'injury_recovery', 'bullish', 'moderate', 'Back to full practice after lost season', 'Elite when healthy; the market discount opens a buy-low case with real risk.', ['injury', 'roleSecurity'])] },
  { id: 'pt_0041', ticker: 'JCB', name: 'Jonathan Taylor', pos: 'RB', team: 'IND', age: 26, exp: 6, prod: 88, usage: 86, opp: 88, eff: 86, role: 86, off: 60, td: 42, inj: 30, hype: 56, games: 15, mis: 6 },
  { id: 'pt_0042', ticker: 'DEH', name: "De'Von Achane", pos: 'RB', team: 'MIA', age: 24, exp: 3, prod: 82, usage: 74, opp: 78, eff: 92, role: 58, off: 60, td: 82, inj: 30, hype: 68, games: 16, mis: -7, cats: [cat(10, 'touchdown_bubble', 'bearish', 'moderate', 'Efficiency-driven line invites regression', 'Explosive on limited volume; a boom-bust weekly profile.', ['efficiency'])] },
  { id: 'pt_0043', ticker: 'KYW', name: 'Kyren Williams', pos: 'RB', team: 'LAR', age: 25, exp: 4, prod: 84, usage: 82, opp: 84, eff: 78, role: 82, off: 70, td: 46, inj: 24, hype: 50, games: 17, mis: -6 },
  { id: 'pt_0044', ticker: 'JGB', name: 'Josh Jacobs', pos: 'RB', team: 'GB', age: 27, exp: 7, prod: 84, usage: 82, opp: 84, eff: 80, role: 84, off: 78, td: 46, inj: 26, hype: 48, games: 17, mis: -4 },
  { id: 'pt_0045', ticker: 'BRW', name: 'Bucky Irving', pos: 'RB', team: 'TB', age: 23, exp: 2, prod: 82, usage: 80, opp: 82, eff: 88, role: 82, off: 70, td: 34, inj: 22, hype: 62, games: 16, mis: 10, cats: [cat(7, 'role_security_improvement', 'bullish', 'moderate', 'Takes over the backfield workload', 'A three-down role solidified the every-week floor.', ['usage', 'roleSecurity'])] },
  { id: 'pt_0046', ticker: 'CBR', name: 'Chase Brown', pos: 'RB', team: 'CIN', age: 25, exp: 3, prod: 82, usage: 82, opp: 82, eff: 80, role: 82, off: 78, td: 42, inj: 24, hype: 52, games: 16, mis: 4 },
  { id: 'pt_0047', ticker: 'BHL', name: 'Breece Hall', pos: 'RB', team: 'NYJ', age: 24, exp: 4, prod: 80, usage: 82, opp: 84, eff: 78, role: 80, off: 46, td: 34, inj: 40, hype: 54, games: 16, mis: 6 },
  { id: 'pt_0048', ticker: 'JCG', name: 'James Cook', pos: 'RB', team: 'BUF', age: 26, exp: 4, prod: 82, usage: 78, opp: 80, eff: 82, role: 80, off: 84, td: 50, inj: 22, hype: 50, games: 17, mis: -8, cats: [cat(9, 'unsustainable_td_rate', 'bearish', 'moderate', 'Touchdown share tops the position', 'A large slice of value sits on hard-to-repeat scoring.', ['efficiency'])] },
  { id: 'pt_0049', ticker: 'OMT', name: 'Omarion Hampton', pos: 'RB', team: 'LAC', age: 22, exp: 1, rookie: true, prod: 74, usage: 78, opp: 80, eff: 74, role: 80, off: 64, td: 38, inj: 20, hype: 66, games: 0, mis: 5, cats: [cat(14, 'rookie_competition_added', 'bullish', 'moderate', 'Projected early-down lead role', 'Draft capital points to immediate volume.', ['opportunity'])] },
  { id: 'pt_0050', ticker: 'TBP', name: 'TreVeyon Henderson', pos: 'RB', team: 'NE', age: 22, exp: 1, rookie: true, prod: 70, usage: 72, opp: 76, eff: 84, role: 72, off: 54, td: 34, inj: 22, hype: 64, games: 0, mis: 2, cats: [cat(15, 'rookie_competition_added', 'bearish', 'minor', 'Committee backfield clouds the workload', 'Talented, but the touch share is unsettled to open the year.', ['roleSecurity'])] },
  { id: 'pt_0051', ticker: 'RJH', name: 'RJ Harvey', pos: 'RB', team: 'DEN', age: 24, exp: 1, rookie: true, prod: 66, usage: 70, opp: 74, eff: 80, role: 72, off: 66, td: 36, inj: 20, hype: 58, games: 0, mis: 4 },
  { id: 'pt_0052', ticker: 'KWJ', name: 'Kenneth Walker III', pos: 'RB', team: 'SEA', age: 25, exp: 4, status: 'questionable', prod: 78, usage: 76, opp: 78, eff: 80, role: 74, off: 62, td: 40, inj: 48, hype: 46, games: 12, mis: 8 },
  { id: 'pt_0053', ticker: 'ISP', name: 'Isiah Pacheco', pos: 'RB', team: 'KC', age: 26, exp: 4, prod: 74, usage: 74, opp: 76, eff: 76, role: 74, off: 80, td: 40, inj: 40, hype: 42, games: 13, mis: 2 },
  { id: 'pt_0054', ticker: 'AJD', name: 'Alvin Kamara', pos: 'RB', team: 'NO', age: 30, exp: 9, prod: 78, usage: 80, opp: 82, eff: 76, role: 80, off: 50, td: 36, inj: 34, hype: 40, games: 15, mis: -14, cats: [cat(11, 'age_curve_milestone', 'bearish', 'moderate', 'RB age cliff enters the valuation', 'Still a workload hog, but 30-year-old backs carry steep decline risk.', ['production'])] },
  { id: 'pt_0055', ticker: 'DAM', name: 'David Montgomery', pos: 'RB', team: 'DET', age: 28, exp: 7, prod: 74, usage: 72, opp: 74, eff: 74, role: 74, off: 86, td: 52, inj: 30, hype: 38, games: 15, mis: -10, cats: [cat(10, 'touchdown_bubble', 'bearish', 'moderate', 'Goal-line role inflates the scoring', 'Touchdown-dependent value in a committee.', ['efficiency'])] },
  { id: 'pt_0056', ticker: 'TNB', name: 'Tony Pollard', pos: 'RB', team: 'TEN', age: 28, exp: 7, prod: 72, usage: 76, opp: 76, eff: 74, role: 76, off: 46, td: 34, inj: 24, hype: 36, games: 16, mis: -2 },
  { id: 'pt_0057', ticker: 'ZCH', name: 'Zach Charbonnet', pos: 'RB', team: 'SEA', age: 25, exp: 3, prod: 66, usage: 62, opp: 68, eff: 78, role: 60, off: 62, td: 38, inj: 22, hype: 48, games: 16, mis: 12, cats: [cat(6, 'teammate_injury', 'bullish', 'moderate', 'One injury from a bellcow role', 'A high-value handcuff with standalone flex appeal.', ['opportunity', 'roleSecurity'])] },
  { id: 'pt_0058', ticker: 'JBP', name: 'Jaylen Warren', pos: 'RB', team: 'PIT', age: 26, exp: 4, prod: 68, usage: 68, opp: 72, eff: 80, role: 66, off: 58, td: 30, inj: 22, hype: 44, games: 16, mis: 6 },
  { id: 'pt_0059', ticker: 'RMD', name: 'Rhamondre Stevenson', pos: 'RB', team: 'NE', age: 27, exp: 5, prod: 66, usage: 70, opp: 72, eff: 66, role: 68, off: 54, td: 34, inj: 30, hype: 34, games: 15, mis: -6 },
  { id: 'pt_0060', ticker: 'BRB', name: 'Brian Robinson Jr.', pos: 'RB', team: 'WAS', age: 26, exp: 4, prod: 66, usage: 68, opp: 70, eff: 68, role: 68, off: 66, td: 42, inj: 26, hype: 34, games: 16, mis: -4 },

  // ---------------- Quarterbacks ----------------
  { id: 'pt_0061', ticker: 'JBH', name: 'Jayden Daniels', pos: 'QB', team: 'WAS', age: 25, exp: 2, prod: 92, usage: 90, opp: 84, eff: 88, role: 94, off: 72, td: 30, inj: 34, hype: 74, games: 16, mis: 6, cats: [cat(9, 'role_security_improvement', 'bullish', 'moderate', 'Dual-threat usage locks in an elite floor', 'Rushing volume makes him a franchise SF cornerstone.', ['usage', 'roleSecurity'])] },
  { id: 'pt_0062', ticker: 'JHU', name: 'Jalen Hurts', pos: 'QB', team: 'PHI', age: 27, exp: 6, prod: 90, usage: 90, opp: 82, eff: 84, role: 94, off: 82, td: 34, inj: 26, hype: 56, games: 16, mis: -2 },
  { id: 'pt_0063', ticker: 'JBW', name: 'Joe Burrow', pos: 'QB', team: 'CIN', age: 29, exp: 6, prod: 92, usage: 82, opp: 84, eff: 92, role: 94, off: 78, td: 24, inj: 44, hype: 58, games: 15, mis: 4 },
  { id: 'pt_0064', ticker: 'CJS', name: 'C.J. Stroud', pos: 'QB', team: 'HOU', age: 24, exp: 3, prod: 82, usage: 78, opp: 80, eff: 82, role: 92, off: 66, td: 24, inj: 24, hype: 58, games: 16, mis: 8, cats: [cat(8, 'efficiency_regression', 'bearish', 'minor', 'Sophomore dip pressures the price', 'A step back in efficiency created a cheaper entry on a young franchise QB.', ['efficiency'])] },
  { id: 'pt_0065', ticker: 'ANR', name: 'Anthony Richardson', pos: 'QB', team: 'IND', age: 23, exp: 3, status: 'questionable', prod: 70, usage: 84, opp: 74, eff: 58, role: 52, off: 58, td: 44, inj: 56, hype: 70, games: 9, mis: 2, cats: [cat(12, 'role_security_improvement', 'bearish', 'moderate', 'Job security wobbles after benching', 'Rushing upside is real, but accuracy and role risk cloud the outlook — a volatile weekly ride.', ['roleSecurity', 'efficiency'])] },
  { id: 'pt_0066', ticker: 'CWN', name: 'Caleb Williams', pos: 'QB', team: 'CHI', age: 24, exp: 2, prod: 78, usage: 80, opp: 80, eff: 76, role: 90, off: 62, td: 26, inj: 22, hype: 70, games: 17, mis: 6 },
  { id: 'pt_0067', ticker: 'DRP', name: 'Drake Maye', pos: 'QB', team: 'NE', age: 23, exp: 2, prod: 76, usage: 82, opp: 76, eff: 74, role: 90, off: 52, td: 26, inj: 24, hype: 62, games: 15, mis: 9, cats: [cat(7, 'offensive_line_change', 'bullish', 'moderate', 'Rebuilt supporting cast raises the ceiling', 'Improved environment points to a second-year jump.', ['offense'])] },
  { id: 'pt_0068', ticker: 'BNX', name: 'Bo Nix', pos: 'QB', team: 'DEN', age: 25, exp: 2, prod: 74, usage: 74, opp: 76, eff: 78, role: 84, off: 70, td: 26, inj: 20, hype: 54, games: 17, mis: 2 },
  { id: 'pt_0069', ticker: 'KYM', name: 'Kyler Murray', pos: 'QB', team: 'ARI', age: 28, exp: 7, prod: 76, usage: 82, opp: 76, eff: 76, role: 84, off: 60, td: 28, inj: 34, hype: 44, games: 16, mis: -4 },
  { id: 'pt_0070', ticker: 'BRP', name: 'Brock Purdy', pos: 'QB', team: 'SF', age: 26, exp: 4, prod: 74, usage: 68, opp: 74, eff: 86, role: 82, off: 78, td: 24, inj: 26, hype: 44, games: 15, mis: -2 },
  { id: 'pt_0071', ticker: 'DKP', name: 'Dak Prescott', pos: 'QB', team: 'DAL', age: 32, exp: 10, prod: 74, usage: 68, opp: 76, eff: 82, role: 84, off: 70, td: 24, inj: 40, hype: 40, games: 12, mis: -6 },
  { id: 'pt_0072', ticker: 'JGF', name: 'Jared Goff', pos: 'QB', team: 'DET', age: 31, exp: 10, prod: 76, usage: 62, opp: 78, eff: 86, role: 84, off: 88, td: 22, inj: 18, hype: 42, games: 17, mis: -6, cats: [cat(10, 'age_curve_milestone', 'bearish', 'minor', 'Pocket passer age curve caps dynasty upside', 'Great real-life QB, limited long-term dynasty appreciation.', ['production'])] },
  { id: 'pt_0073', ticker: 'TTG', name: 'Trevor Lawrence', pos: 'QB', team: 'JAX', age: 26, exp: 5, prod: 74, usage: 76, opp: 76, eff: 72, role: 90, off: 56, td: 24, inj: 30, hype: 50, games: 15, mis: 8 },
  { id: 'pt_0074', ticker: 'JJM', name: 'J.J. McCarthy', pos: 'QB', team: 'MIN', age: 22, exp: 2, prod: 66, usage: 70, opp: 74, eff: 70, role: 84, off: 76, td: 24, inj: 30, hype: 62, games: 6, mis: 10, cats: [cat(6, 'role_spike', 'bullish', 'moderate', 'Takes the reins of a loaded offense', 'Cheap entry on a young QB in a strong environment.', ['offense', 'roleSecurity'])] },
  { id: 'pt_0075', ticker: 'MPN', name: 'Michael Penix Jr.', pos: 'QB', team: 'ATL', age: 25, exp: 2, prod: 68, usage: 68, opp: 74, eff: 74, role: 82, off: 70, td: 24, inj: 24, hype: 52, games: 8, mis: 6 },

  // ---------------- Tight ends ----------------
  { id: 'pt_0076', ticker: 'MAN', name: 'Trey McBride', pos: 'TE', team: 'ARI', age: 26, exp: 4, prod: 86, usage: 88, opp: 86, eff: 82, role: 90, off: 58, td: 28, inj: 20, hype: 54, games: 16, mis: 8, cats: [cat(8, 'target_share_change', 'bullish', 'moderate', 'Target share rivals a WR1', 'Elite volume gives a rare positional edge.', ['opportunity', 'usage'])] },
  { id: 'pt_0077', ticker: 'GKT', name: 'George Kittle', pos: 'TE', team: 'SF', age: 32, exp: 9, prod: 82, usage: 78, opp: 78, eff: 90, role: 84, off: 78, td: 40, inj: 40, hype: 46, games: 15, mis: -10, cats: [cat(10, 'age_curve_milestone', 'bearish', 'moderate', 'Age curve steepens for an elite TE', 'Still dominant, but the dynasty runway is short.', ['production'])] },
  { id: 'pt_0078', ticker: 'SLB', name: 'Sam LaPorta', pos: 'TE', team: 'DET', age: 24, exp: 3, prod: 80, usage: 82, opp: 80, eff: 80, role: 84, off: 86, td: 34, inj: 24, hype: 52, games: 16, mis: 6 },
  { id: 'pt_0079', ticker: 'TKL', name: 'Travis Kelce', pos: 'TE', team: 'KC', age: 36, exp: 13, prod: 74, usage: 78, opp: 78, eff: 76, role: 80, off: 80, td: 34, inj: 26, hype: 44, games: 16, mis: -22, cats: [cat(9, 'age_curve_milestone', 'bearish', 'major', 'Legend price meets the age cliff', 'Productive, but dynasty value is a rapidly wasting asset at 36.', ['production'])] },
  { id: 'pt_0080', ticker: 'DAG', name: 'Dalton Kincaid', pos: 'TE', team: 'BUF', age: 25, exp: 3, prod: 68, usage: 74, opp: 74, eff: 72, role: 74, off: 84, td: 30, inj: 26, hype: 50, games: 14, mis: 10, cats: [cat(7, 'role_spike', 'bullish', 'moderate', 'Route share trends up in camp', 'A cheaper bet on a young TE in a strong offense.', ['usage'])] },
  { id: 'pt_0081', ticker: 'TCB', name: 'T.J. Hockenson', pos: 'TE', team: 'MIN', age: 28, exp: 7, prod: 74, usage: 78, opp: 78, eff: 76, role: 80, off: 76, td: 28, inj: 44, hype: 40, games: 12, mis: 2 },
  { id: 'pt_0082', ticker: 'DWL', name: 'David Njoku', pos: 'TE', team: 'CLE', age: 29, exp: 9, prod: 72, usage: 78, opp: 78, eff: 74, role: 80, off: 46, td: 30, inj: 30, hype: 38, games: 14, mis: -4 },
  { id: 'pt_0083', ticker: 'EVG', name: 'Evan Engram', pos: 'TE', team: 'DEN', age: 31, exp: 9, prod: 70, usage: 78, opp: 78, eff: 72, role: 78, off: 66, td: 24, inj: 34, hype: 34, games: 13, mis: -8 },
  { id: 'pt_0084', ticker: 'LOV', name: 'Colston Loveland', pos: 'TE', team: 'CHI', age: 21, exp: 1, rookie: true, prod: 58, usage: 62, opp: 66, eff: 68, role: 64, off: 60, td: 28, inj: 20, hype: 56, games: 0, mis: 3 },
  { id: 'pt_0085', ticker: 'TWR', name: 'Tyler Warren', pos: 'TE', team: 'IND', age: 23, exp: 1, rookie: true, prod: 60, usage: 66, opp: 70, eff: 66, role: 68, off: 56, td: 30, inj: 20, hype: 60, games: 0, mis: 5, cats: [cat(13, 'rookie_competition_added', 'bullish', 'minor', 'Every-down role projected early', 'Draft capital and usage profile suggest immediate targets.', ['opportunity'])] },

  // ---------------- Rookie IPOs (WR/skill) ----------------
  { id: 'pt_0086', ticker: 'TET', name: 'Tetairoa McMillan', pos: 'WR', team: 'CAR', age: 22, exp: 1, rookie: true, prod: 64, usage: 72, opp: 76, eff: 70, role: 76, off: 44, td: 30, inj: 20, hype: 66, games: 0, mis: 4, cats: [cat(12, 'rookie_competition_added', 'bullish', 'moderate', 'Projected day-one alpha target', 'Size and draft capital point to immediate WR1 volume.', ['opportunity'])] },
  { id: 'pt_0087', ticker: 'EMT', name: 'Emeka Egbuka', pos: 'WR', team: 'TB', age: 22, exp: 1, rookie: true, prod: 62, usage: 70, opp: 74, eff: 74, role: 74, off: 66, td: 30, inj: 18, hype: 58, games: 0, mis: 3 },
  { id: 'pt_0088', ticker: 'MTG', name: 'Matthew Golden', pos: 'WR', team: 'GB', age: 22, exp: 1, rookie: true, prod: 58, usage: 66, opp: 70, eff: 76, role: 70, off: 74, td: 32, inj: 18, hype: 54, games: 0, mis: 2 },
  { id: 'pt_0089', ticker: 'LNT', name: 'Luther Burden III', pos: 'WR', team: 'CHI', age: 22, exp: 1, rookie: true, prod: 56, usage: 64, opp: 70, eff: 74, role: 66, off: 60, td: 30, inj: 18, hype: 52, games: 0, mis: 3 },
  { id: 'pt_0090', ticker: 'TRS', name: 'Travis Hunter', pos: 'WR', team: 'JAX', age: 22, exp: 1, rookie: true, prod: 60, usage: 66, opp: 72, eff: 72, role: 68, off: 54, td: 30, inj: 22, hype: 78, games: 0, mis: -8, cats: [cat(11, 'hype_surge', 'bearish', 'moderate', 'Two-way role clouds the target projection', 'Elite talent, but snap allocation on offense is uncertain.', ['roleSecurity', 'opportunity'])] },

  // ---------------- Aging veterans / Dividend / Age Cliff ----------------
  { id: 'pt_0091', ticker: 'AAB', name: 'Aaron Jones', pos: 'RB', team: 'MIN', age: 31, exp: 8, prod: 72, usage: 74, opp: 74, eff: 74, role: 74, off: 76, td: 36, inj: 40, hype: 34, games: 14, mis: -16, cats: [cat(9, 'age_curve_milestone', 'bearish', 'moderate', 'Age and workload history compress value', 'Reliable when healthy, but the RB cliff is here.', ['production', 'injury'])] },
  { id: 'pt_0092', ticker: 'JMX', name: 'Joe Mixon', pos: 'RB', team: 'HOU', age: 29, exp: 8, status: 'ir_short', prod: 90, usage: 84, opp: 86, eff: 78, role: 40, off: 56, td: 52, inj: 90, hype: 46, games: 9, mis: -26, cats: [cat(8, 'own_injury', 'bearish', 'major', 'Foot injury lands him on IR with a cloudy timeline', 'Aging back, lost role, and a value that still asks buyers to pay up — a value trap.', ['injury', 'roleSecurity'])] },
  { id: 'pt_0093', ticker: 'DEK', name: 'Derrick Henry', pos: 'RB', team: 'BAL', age: 31, exp: 10, prod: 86, usage: 78, opp: 78, eff: 82, role: 82, off: 82, td: 54, inj: 26, hype: 50, games: 16, mis: -18, cats: [cat(8, 'unsustainable_td_rate', 'bearish', 'moderate', 'Historic TD pace meets the age cliff', 'Still elite, but 31-year-old backs are wasting dynasty assets.', ['efficiency', 'production'])] },
  { id: 'pt_0094', ticker: 'KAL', name: 'Keenan Allen', pos: 'WR', team: 'LAC', age: 33, exp: 12, prod: 70, usage: 78, opp: 78, eff: 74, role: 76, off: 60, td: 26, inj: 40, hype: 30, games: 13, mis: -14 },
  { id: 'pt_0095', ticker: 'ADT', name: 'Adam Thielen', pos: 'WR', team: 'MIN', age: 35, exp: 12, prod: 60, usage: 66, opp: 68, eff: 68, role: 66, off: 70, td: 30, inj: 40, hype: 24, games: 12, mis: -10 },
  { id: 'pt_0096', ticker: 'EKL', name: 'Austin Ekeler', pos: 'RB', team: 'WAS', age: 30, exp: 8, prod: 64, usage: 68, opp: 72, eff: 70, role: 66, off: 70, td: 30, inj: 44, hype: 30, games: 13, mis: -8 },

  // ---------------- Volatile / TD-dependent / Touchdown Bubble ----------------
  { id: 'pt_0097', ticker: 'RRC', name: 'Rashee Rice', pos: 'WR', team: 'KC', age: 25, exp: 3, status: 'questionable', prod: 76, usage: 82, opp: 82, eff: 82, role: 80, off: 80, td: 34, inj: 46, hype: 62, games: 7, mis: 14, cats: [cat(6, 'injury_recovery', 'bullish', 'moderate', 'On track to return to a featured role', 'A discounted price on a target earner in an elite offense.', ['injury', 'opportunity'])] },
  { id: 'pt_0098', ticker: 'JDW', name: 'Jordan Addison', pos: 'WR', team: 'MIN', age: 23, exp: 3, prod: 74, usage: 76, opp: 76, eff: 80, role: 76, off: 76, td: 44, inj: 22, hype: 52, games: 15, mis: -6 },
  { id: 'pt_0099', ticker: 'CGN', name: 'Courtland Sutton', pos: 'WR', team: 'DEN', age: 30, exp: 8, prod: 76, usage: 80, opp: 80, eff: 74, role: 80, off: 70, td: 48, inj: 24, hype: 40, games: 16, mis: -10, cats: [cat(9, 'touchdown_bubble', 'bearish', 'moderate', 'Scoring line leans on red-zone luck', 'Volume is fine; the touchdown rate likely regresses.', ['efficiency'])] },
  { id: 'pt_0100', ticker: 'JTN', name: 'Jauan Jennings', pos: 'WR', team: 'SF', age: 28, exp: 6, prod: 66, usage: 70, opp: 72, eff: 74, role: 66, off: 78, td: 40, inj: 28, hype: 44, games: 14, mis: -8 },
  { id: 'pt_0101', ticker: 'WDR', name: 'Wan\'Dale Robinson', pos: 'WR', team: 'NYG', age: 25, exp: 4, prod: 62, usage: 76, opp: 74, eff: 66, role: 72, off: 40, td: 22, inj: 26, hype: 38, games: 16, mis: 4 },
  { id: 'pt_0102', ticker: 'KHJ', name: 'Khalil Shakir', pos: 'WR', team: 'BUF', age: 25, exp: 4, prod: 68, usage: 72, opp: 72, eff: 82, role: 74, off: 82, td: 28, inj: 20, hype: 42, games: 16, mis: 2 },
  { id: 'pt_0103', ticker: 'RTM', name: 'Romeo Doubs', pos: 'WR', team: 'GB', age: 25, exp: 4, prod: 60, usage: 66, opp: 68, eff: 70, role: 64, off: 74, td: 38, inj: 24, hype: 34, games: 15, mis: -6 },

  // ---------------- Deep stashes / Penny Stocks / breakout darts ----------------
  { id: 'pt_0104', ticker: 'TBG', name: 'Tank Bigsby', pos: 'RB', team: 'JAX', age: 24, exp: 3, prod: 58, usage: 54, opp: 60, eff: 70, role: 52, off: 56, td: 40, inj: 22, hype: 44, games: 16, mis: 8, cats: [cat(6, 'teammate_injury', 'bullish', 'moderate', 'A backfield injury away from volume', 'Standalone value is thin, but the upside is real.', ['opportunity'])] },
  { id: 'pt_0105', ticker: 'RSH', name: 'Roschon Johnson', pos: 'RB', team: 'CHI', age: 24, exp: 3, prod: 52, usage: 48, opp: 56, eff: 66, role: 50, off: 62, td: 44, inj: 22, hype: 36, games: 16, mis: 4 },
  { id: 'pt_0106', ticker: 'TBN', name: 'Tyjae Spears', pos: 'RB', team: 'TEN', age: 24, exp: 3, prod: 56, usage: 54, opp: 62, eff: 74, role: 52, off: 46, td: 34, inj: 32, hype: 40, games: 14, mis: 6 },
  { id: 'pt_0107', ticker: 'BLM', name: 'Blake Corum', pos: 'RB', team: 'LAR', age: 24, exp: 2, prod: 50, usage: 46, opp: 56, eff: 68, role: 48, off: 70, td: 36, inj: 20, hype: 42, games: 15, mis: 10, cats: [cat(7, 'teammate_injury', 'bullish', 'minor', 'High-value handcuff to a workhorse', 'Immediate RB1 upside if the starter misses time.', ['opportunity', 'roleSecurity'])] },
  { id: 'pt_0108', ticker: 'JLM', name: 'Jalen McMillan', pos: 'WR', team: 'TB', age: 23, exp: 2, prod: 56, usage: 60, opp: 64, eff: 72, role: 60, off: 66, td: 40, inj: 20, hype: 44, games: 15, mis: 6 },
  { id: 'pt_0109', ticker: 'DDL', name: 'Dontayvion Wicks', pos: 'WR', team: 'GB', age: 24, exp: 3, prod: 48, usage: 54, opp: 58, eff: 66, role: 54, off: 74, td: 34, inj: 20, hype: 30, games: 15, mis: 2 },
  { id: 'pt_0110', ticker: 'RPS', name: 'Ricky Pearsall', pos: 'WR', team: 'SF', age: 24, exp: 2, prod: 58, usage: 64, opp: 66, eff: 72, role: 64, off: 78, td: 30, inj: 30, hype: 48, games: 11, mis: 8, cats: [cat(6, 'role_spike', 'bullish', 'moderate', 'Path to a starting role opens up', 'Depth-chart movement points to a usage bump.', ['usage', 'opportunity'])] },
  { id: 'pt_0111', ticker: 'AJT', name: 'Adonai Mitchell', pos: 'WR', team: 'IND', age: 23, exp: 2, prod: 46, usage: 52, opp: 58, eff: 70, role: 52, off: 60, td: 36, inj: 18, hype: 40, games: 14, mis: 6 },
  { id: 'pt_0112', ticker: 'MWP', name: 'Marvin Mims Jr.', pos: 'WR', team: 'DEN', age: 23, exp: 3, prod: 56, usage: 54, opp: 58, eff: 84, role: 46, off: 70, td: 88, inj: 20, hype: 50, games: 16, mis: 1, cats: [cat(8, 'touchdown_bubble', 'bearish', 'minor', 'Big plays carry a thin target share', 'Explosive, but the role is still situational — the value swings week to week.', ['efficiency'])] },
  { id: 'pt_0113', ticker: 'QJW', name: 'Quentin Johnston', pos: 'WR', team: 'LAC', age: 24, exp: 3, prod: 56, usage: 62, opp: 64, eff: 60, role: 62, off: 64, td: 46, inj: 20, hype: 38, games: 15, mis: -8 },
  { id: 'pt_0114', ticker: 'JFR', name: 'Jerry Jeudy', pos: 'WR', team: 'CLE', age: 26, exp: 6, prod: 68, usage: 76, opp: 76, eff: 72, role: 76, off: 42, td: 28, inj: 22, hype: 40, games: 16, mis: 4 },
  { id: 'pt_0115', ticker: 'CBH', name: 'Cam Skattebo', pos: 'RB', team: 'NYG', age: 23, exp: 1, rookie: true, prod: 54, usage: 58, opp: 64, eff: 66, role: 62, off: 42, td: 36, inj: 20, hype: 52, games: 0, mis: 4 },
  { id: 'pt_0116', ticker: 'KMB', name: 'Kaleb Johnson', pos: 'RB', team: 'PIT', age: 22, exp: 1, rookie: true, prod: 52, usage: 56, opp: 62, eff: 68, role: 60, off: 58, td: 38, inj: 18, hype: 50, games: 0, mis: 5 },
  { id: 'pt_0117', ticker: 'DJT', name: 'Dylan Sampson', pos: 'RB', team: 'CLE', age: 21, exp: 1, rookie: true, prod: 48, usage: 50, opp: 58, eff: 70, role: 54, off: 44, td: 34, inj: 18, hype: 46, games: 0, mis: 3 },
  { id: 'pt_0118', ticker: 'JHL', name: 'Jaylen Wright', pos: 'RB', team: 'MIA', age: 22, exp: 2, prod: 48, usage: 44, opp: 54, eff: 76, role: 46, off: 60, td: 34, inj: 20, hype: 44, games: 15, mis: 8 },
  { id: 'pt_0119', ticker: 'MPR', name: 'MarShawn Lloyd', pos: 'RB', team: 'GB', age: 24, exp: 2, prod: 44, usage: 40, opp: 52, eff: 72, role: 44, off: 74, td: 34, inj: 40, hype: 42, games: 6, mis: 10 },
  { id: 'pt_0120', ticker: 'JFS', name: 'Jayden Reed', pos: 'WR', team: 'GB', age: 25, exp: 3, prod: 66, usage: 70, opp: 70, eff: 80, role: 70, off: 74, td: 42, inj: 24, hype: 46, games: 15, mis: -4 },
  { id: 'pt_0121', ticker: 'DPK', name: 'Deebo Samuel', pos: 'WR', team: 'WAS', age: 29, exp: 7, prod: 72, usage: 76, opp: 76, eff: 74, role: 74, off: 72, td: 40, inj: 44, hype: 42, games: 14, mis: -8 },
  { id: 'pt_0122', ticker: 'CKR', name: 'Christian Kirk', pos: 'WR', team: 'HOU', age: 29, exp: 8, prod: 62, usage: 72, opp: 72, eff: 74, role: 72, off: 66, td: 30, inj: 40, hype: 32, games: 12, mis: -4 },
  { id: 'pt_0123', ticker: 'DHW', name: 'Diontae Johnson', pos: 'WR', team: 'CLE', age: 29, exp: 7, prod: 58, usage: 70, opp: 70, eff: 68, role: 60, off: 44, td: 28, inj: 30, hype: 30, games: 14, mis: -10, cats: [cat(9, 'role_security_improvement', 'bearish', 'moderate', 'Bounced between teams; role uncertain', 'Talent is there, but the situation and effort questions weigh.', ['roleSecurity'])] },
  { id: 'pt_0124', ticker: 'PSK', name: 'Pat Freiermuth', pos: 'TE', team: 'PIT', age: 27, exp: 5, prod: 62, usage: 70, opp: 70, eff: 72, role: 74, off: 58, td: 32, inj: 24, hype: 34, games: 16, mis: 2 },
  { id: 'pt_0125', ticker: 'JCS', name: 'Jake Ferguson', pos: 'TE', team: 'DAL', age: 26, exp: 4, prod: 64, usage: 72, opp: 72, eff: 70, role: 76, off: 70, td: 28, inj: 26, hype: 36, games: 14, mis: 4 },
  { id: 'pt_0126', ticker: 'CDX', name: 'Cade Otton', pos: 'TE', team: 'TB', age: 26, exp: 4, prod: 58, usage: 68, opp: 68, eff: 66, role: 72, off: 66, td: 30, inj: 22, hype: 30, games: 15, mis: 2 },
  { id: 'pt_0127', ticker: 'DAW', name: 'Dallas Goedert', pos: 'TE', team: 'PHI', age: 30, exp: 8, prod: 66, usage: 72, opp: 72, eff: 74, role: 74, off: 78, td: 30, inj: 40, hype: 32, games: 12, mis: -6 },
  { id: 'pt_0128', ticker: 'HHN', name: 'Hunter Henry', pos: 'TE', team: 'NE', age: 31, exp: 10, prod: 60, usage: 70, opp: 70, eff: 70, role: 74, off: 52, td: 30, inj: 26, hype: 28, games: 16, mis: -6 },
  { id: 'pt_0129', ticker: 'ZMB', name: 'Zach Ertz', pos: 'TE', team: 'WAS', age: 35, exp: 13, prod: 60, usage: 72, opp: 72, eff: 66, role: 72, off: 66, td: 34, inj: 26, hype: 26, games: 16, mis: -12, cats: [cat(10, 'age_curve_milestone', 'bearish', 'moderate', 'Productive now, no dynasty runway', 'Useful redraft piece; a wasting asset in dynasty.', ['production'])] },
  { id: 'pt_0130', ticker: 'TUA', name: 'Tua Tagovailoa', pos: 'QB', team: 'MIA', age: 27, exp: 6, status: 'questionable', prod: 70, usage: 64, opp: 74, eff: 82, role: 78, off: 62, td: 22, inj: 58, hype: 40, games: 11, mis: 6 },
  { id: 'pt_0131', ticker: 'MSF', name: 'Matthew Stafford', pos: 'QB', team: 'LAR', age: 37, exp: 16, prod: 66, usage: 60, opp: 74, eff: 82, role: 78, off: 72, td: 22, inj: 40, hype: 34, games: 15, mis: -16, cats: [cat(9, 'age_curve_milestone', 'bearish', 'major', 'Elite arm, near-zero dynasty runway', 'Great redraft QB; dynasty value is minimal at 37.', ['production'])] },
  { id: 'pt_0132', ticker: 'GWN', name: 'Geno Smith', pos: 'QB', team: 'LV', age: 35, exp: 12, prod: 62, usage: 60, opp: 72, eff: 76, role: 76, off: 58, td: 22, inj: 24, hype: 30, games: 16, mis: -8 },
  { id: 'pt_0133', ticker: 'RWL', name: 'Russell Wilson', pos: 'QB', team: 'NYG', age: 37, exp: 14, prod: 54, usage: 58, opp: 66, eff: 68, role: 66, off: 46, td: 26, inj: 28, hype: 28, games: 14, mis: -12 },
  { id: 'pt_0134', ticker: 'FLD', name: 'Justin Fields', pos: 'QB', team: 'NYJ', age: 26, exp: 5, prod: 74, usage: 88, opp: 76, eff: 70, role: 78, off: 52, td: 30, inj: 26, hype: 54, games: 14, mis: 8, cats: [cat(7, 'role_spike', 'bullish', 'moderate', 'Rushing role revives the QB1 upside', 'Legs give a high weekly ceiling in a new starting job.', ['usage'])] },
  { id: 'pt_0135', ticker: 'WLV', name: 'Will Levis', pos: 'QB', team: 'TEN', age: 26, exp: 3, prod: 58, usage: 66, opp: 68, eff: 60, role: 68, off: 44, td: 28, inj: 26, hype: 34, games: 12, mis: -8 },
  { id: 'pt_0136', ticker: 'TDN', name: 'Tyler Allgeier', pos: 'RB', team: 'ATL', age: 25, exp: 4, prod: 54, usage: 48, opp: 56, eff: 70, role: 50, off: 72, td: 40, inj: 20, hype: 32, games: 16, mis: 4 },
  { id: 'pt_0137', ticker: 'RAY', name: 'Ray Davis', pos: 'RB', team: 'BUF', age: 25, exp: 2, prod: 46, usage: 42, opp: 52, eff: 68, role: 44, off: 82, td: 40, inj: 20, hype: 38, games: 15, mis: 6 },
  { id: 'pt_0138', ticker: 'ELW', name: 'Elijah Moore', pos: 'WR', team: 'BUF', age: 25, exp: 5, prod: 56, usage: 64, opp: 66, eff: 70, role: 62, off: 82, td: 28, inj: 22, hype: 36, games: 15, mis: 2 },
  { id: 'pt_0139', ticker: 'DPS', name: 'Darnell Mooney', pos: 'WR', team: 'ATL', age: 28, exp: 6, prod: 64, usage: 68, opp: 70, eff: 78, role: 70, off: 68, td: 40, inj: 26, hype: 34, games: 15, mis: -6 },
  { id: 'pt_0140', ticker: 'RTB', name: 'Rashid Shaheed', pos: 'WR', team: 'NO', age: 27, exp: 4, prod: 60, usage: 62, opp: 64, eff: 86, role: 64, off: 48, td: 44, inj: 30, hype: 40, games: 12, mis: -6 },
  { id: 'pt_0141', ticker: 'DBN', name: 'Demario Douglas', pos: 'WR', team: 'NE', age: 24, exp: 3, prod: 54, usage: 64, opp: 66, eff: 70, role: 64, off: 52, td: 22, inj: 20, hype: 34, games: 16, mis: 2 },
];
