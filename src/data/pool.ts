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
  ticker: string;
  name: string;
  pos: Position;
  team: string;
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
    ticker: 'JMC', name: "Ja'Marr Chase", pos: 'WR', team: 'CIN', age: 25, exp: 5,
    prod: 98, usage: 95, opp: 96, eff: 94, role: 96, off: 82, td: 40, inj: 20, hype: 60, games: 16, mis: 2,
    cats: [
      cat(9, 'target_share_change', 'bullish', 'minor', 'Target share holds at 31%', 'Route participation and target share remain elite; no crack in the profile.', ['opportunity', 'usage']),
    ],
  },
  {
    ticker: 'ALN', name: 'Josh Allen', pos: 'QB', team: 'BUF', age: 29, exp: 8,
    prod: 96, usage: 90, opp: 88, eff: 90, role: 98, off: 84, td: 30, inj: 22, hype: 55, games: 17, mis: -3,
    cats: [cat(20, 'role_security_improvement', 'bullish', 'minor', 'Rushing floor keeps SF QB1 tier intact', 'Designed-run volume protects the league-winning weekly floor in Superflex.', ['usage', 'roleSecurity'])],
  },
  {
    ticker: 'JJF', name: 'Justin Jefferson', pos: 'WR', team: 'MIN', age: 26, exp: 6,
    prod: 96, usage: 94, opp: 95, eff: 93, role: 94, off: 74, td: 42, inj: 30, hype: 58, games: 15, mis: 6,
    cats: [cat(14, 'efficiency_spike', 'bullish', 'moderate', 'Yards-per-route-run back to elite tier', 'Efficiency rebounded toward career norms; quiet drift up on stable usage.', ['efficiency', 'production'])],
  },
  {
    ticker: 'BIJ', name: 'Bijan Robinson', pos: 'RB', team: 'ATL', age: 24, exp: 3,
    prod: 93, usage: 92, opp: 93, eff: 88, role: 92, off: 72, td: 38, inj: 24, hype: 72, games: 17, mis: -8,
    cats: [cat(11, 'hype_surge', 'bullish', 'moderate', 'Consensus RB1 hype lifts the price', 'Market has bid the price slightly ahead of an already-elite profile.', ['production'])],
  },
  {
    ticker: 'GIB', name: 'Jahmyr Gibbs', pos: 'RB', team: 'DET', age: 24, exp: 3,
    prod: 90, usage: 84, opp: 88, eff: 91, role: 82, off: 86, td: 46, inj: 26, hype: 66, games: 16, mis: 8,
    cats: [
      cat(7, 'red_zone_usage_change', 'bullish', 'moderate', 'Red-zone carry share climbed to 58%', 'Goal-line role expanded, lifting the touchdown projection and the model value.', ['opportunity', 'production']),
      cat(30, 'role_security_improvement', 'bullish', 'minor', 'Passing-down snaps trending up', 'Third-down usage rose, deepening the every-week floor.', ['usage', 'roleSecurity']),
    ],
  },
  {
    ticker: 'LMB', name: 'CeeDee Lamb', pos: 'WR', team: 'DAL', age: 26, exp: 6,
    prod: 92, usage: 93, opp: 92, eff: 86, role: 92, off: 70, td: 40, inj: 24, hype: 56, games: 16, mis: 3,
  },
  {
    ticker: 'HRT', name: 'Amon-Ra St. Brown', pos: 'WR', team: 'DET', age: 26, exp: 5,
    prod: 91, usage: 92, opp: 90, eff: 88, role: 93, off: 86, td: 38, inj: 18, hype: 50, games: 16, mis: 4,
  },
  {
    ticker: 'LMR', name: 'Lamar Jackson', pos: 'QB', team: 'BAL', age: 28, exp: 8,
    prod: 95, usage: 92, opp: 86, eff: 92, role: 96, off: 82, td: 32, inj: 34, hype: 58, games: 16, mis: -2,
  },
  {
    ticker: 'MHM', name: 'Patrick Mahomes', pos: 'QB', team: 'KC', age: 30, exp: 9,
    prod: 90, usage: 86, opp: 84, eff: 90, role: 97, off: 80, td: 30, inj: 20, hype: 52, games: 17, mis: -4,
  },
  {
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
    ticker: 'BOW', name: 'Brock Bowers', pos: 'TE', team: 'LV', age: 22, exp: 2,
    prod: 86, usage: 88, opp: 84, eff: 82, role: 88, off: 52, td: 36, inj: 22, hype: 88, games: 17, mis: -18,
    cats: [
      cat(6, 'hype_surge', 'bearish', 'moderate', 'Price assumes a target ceiling route share doesn’t support', 'Elite young TE, but the market now pays for a role expansion that hasn’t happened yet.', ['production', 'opportunity']),
      cat(18, 'efficiency_spike', 'bullish', 'minor', 'Yards after catch spikes over three weeks', 'Short-term efficiency surge fed the hype cycle.', ['efficiency']),
    ],
  },
  {
    ticker: 'JTY', name: 'Ashton Jeanty', pos: 'RB', team: 'LV', age: 21, exp: 1, rookie: true,
    prod: 78, usage: 82, opp: 84, eff: 76, role: 84, off: 50, td: 40, inj: 24, hype: 80, games: 0, mis: 24,
    cats: [cat(15, 'rookie_competition_added', 'bullish', 'moderate', 'Named clear lead back out of camp', 'Landing spot and draft capital point to an immediate three-down role; the rookie discount looks steep.', ['opportunity', 'roleSecurity'])],
  },

  // ---------------- Strong starters (WR) ----------------
  { ticker: 'PUK', name: 'Puka Nacua', pos: 'WR', team: 'LAR', age: 24, exp: 3, prod: 89, usage: 90, opp: 88, eff: 86, role: 86, off: 70, td: 34, inj: 40, hype: 60, games: 14, mis: 6 },
  { ticker: 'GBW', name: 'Garrett Wilson', pos: 'WR', team: 'NYJ', age: 25, exp: 4, prod: 84, usage: 90, opp: 89, eff: 80, role: 88, off: 46, td: 30, inj: 22, hype: 54, games: 16, mis: 9, cats: [cat(12, 'qb_change', 'bullish', 'moderate', 'Upgrade under center lifts the ceiling', 'A stronger passing environment raises the projection after a quiet season.', ['offense', 'production'])] },
  { ticker: 'DVA', name: 'Drake London', pos: 'WR', team: 'ATL', age: 24, exp: 4, prod: 85, usage: 89, opp: 90, eff: 82, role: 88, off: 68, td: 32, inj: 20, hype: 55, games: 16, mis: 7 },
  { ticker: 'NAW', name: 'Nico Collins', pos: 'WR', team: 'HOU', age: 26, exp: 5, prod: 87, usage: 86, opp: 85, eff: 90, role: 87, off: 72, td: 40, inj: 44, hype: 52, games: 13, mis: 5 },
  { ticker: 'BTW', name: 'Brian Thomas Jr.', pos: 'WR', team: 'JAX', age: 23, exp: 2, prod: 84, usage: 84, opp: 86, eff: 88, role: 84, off: 54, td: 44, inj: 20, hype: 68, games: 16, mis: 10, cats: [cat(8, 'target_share_change', 'bullish', 'moderate', 'Emerges as clear alpha target', 'Second-year leap in target share underpins the breakout profile.', ['opportunity', 'usage'])] },
  { ticker: 'AJB', name: 'A.J. Brown', pos: 'WR', team: 'PHI', age: 28, exp: 7, prod: 88, usage: 84, opp: 84, eff: 88, role: 86, off: 78, td: 36, inj: 42, hype: 50, games: 14, mis: 2 },
  { ticker: 'TYH', name: 'Tyreek Hill', pos: 'WR', team: 'MIA', age: 31, exp: 10, prod: 82, usage: 84, opp: 82, eff: 84, role: 82, off: 60, td: 40, inj: 40, hype: 48, games: 15, mis: -10, cats: [cat(10, 'age_curve_milestone', 'bearish', 'moderate', 'Age-curve pressure enters the price', 'Elite still, but the dynasty market now bakes in decline risk at 31.', ['production'])] },
  { ticker: 'DKM', name: 'DK Metcalf', pos: 'WR', team: 'PIT', age: 27, exp: 7, prod: 82, usage: 82, opp: 80, eff: 82, role: 84, off: 58, td: 42, inj: 24, hype: 46, games: 16, mis: -4 },
  { ticker: 'DBS', name: 'Davante Adams', pos: 'WR', team: 'LAR', age: 32, exp: 12, prod: 82, usage: 84, opp: 83, eff: 84, role: 82, off: 70, td: 44, inj: 30, hype: 44, games: 14, mis: -20, cats: [cat(9, 'age_curve_milestone', 'bearish', 'major', 'Name value runs ahead of the age curve', 'Production holds, but the price still asks buyers to pay for the prime years.', ['production'])] },
  { ticker: 'MRH', name: 'Marvin Harrison Jr.', pos: 'WR', team: 'ARI', age: 23, exp: 2, prod: 80, usage: 84, opp: 86, eff: 76, role: 86, off: 58, td: 34, inj: 20, hype: 74, games: 16, mis: -6, cats: [cat(13, 'hype_surge', 'bearish', 'minor', 'Sophomore hype outpaces the target share', 'Pedigree keeps sentiment high while usage still has room to grow.', ['opportunity'])] },
  { ticker: 'RCE', name: 'Rome Odunze', pos: 'WR', team: 'CHI', age: 23, exp: 2, prod: 74, usage: 80, opp: 82, eff: 78, role: 80, off: 56, td: 30, inj: 20, hype: 62, games: 16, mis: 8, cats: [cat(6, 'role_spike', 'bullish', 'moderate', 'Slot-plus-boundary role expands', 'A wider route tree points to a second-year usage jump.', ['usage', 'opportunity'])] },
  { ticker: 'JSS', name: 'Jaxon Smith-Njigba', pos: 'WR', team: 'SEA', age: 23, exp: 3, prod: 83, usage: 86, opp: 85, eff: 84, role: 86, off: 62, td: 30, inj: 18, hype: 56, games: 17, mis: 7 },
  { ticker: 'LDN', name: 'Ladd McConkey', pos: 'WR', team: 'LAC', age: 24, exp: 2, prod: 80, usage: 84, opp: 82, eff: 86, role: 84, off: 64, td: 30, inj: 22, hype: 54, games: 16, mis: 5 },
  { ticker: 'TMC', name: 'Terry McLaurin', pos: 'WR', team: 'WAS', age: 30, exp: 7, prod: 82, usage: 82, opp: 82, eff: 82, role: 84, off: 66, td: 42, inj: 24, hype: 42, games: 16, mis: -6 },
  { ticker: 'MPT', name: 'Mike Evans', pos: 'WR', team: 'TB', age: 32, exp: 12, prod: 82, usage: 78, opp: 78, eff: 84, role: 82, off: 68, td: 52, inj: 34, hype: 42, games: 14, mis: -16, cats: [cat(11, 'unsustainable_td_rate', 'bearish', 'moderate', 'Touchdown rate sits well above expected', 'Elite red-zone output is unlikely to fully repeat; regression risk priced light.', ['efficiency', 'production'])] },
  { ticker: 'CGB', name: 'Chris Godwin', pos: 'WR', team: 'TB', age: 29, exp: 8, status: 'questionable', prod: 78, usage: 82, opp: 82, eff: 80, role: 80, off: 68, td: 30, inj: 60, hype: 44, games: 7, mis: 16, cats: [cat(5, 'injury_recovery', 'bullish', 'moderate', 'Ahead of schedule in rehab', 'A cheaper injury-discounted price on a proven target earner.', ['injury'])] },
  { ticker: 'DSM', name: 'DeVonta Smith', pos: 'WR', team: 'PHI', age: 27, exp: 5, prod: 80, usage: 80, opp: 80, eff: 84, role: 84, off: 78, td: 34, inj: 22, hype: 44, games: 16, mis: 0 },
  { ticker: 'ZAF', name: 'Zay Flowers', pos: 'WR', team: 'BAL', age: 25, exp: 3, prod: 80, usage: 82, opp: 82, eff: 82, role: 82, off: 82, td: 30, inj: 20, hype: 50, games: 17, mis: 4 },
  { ticker: 'GEB', name: 'George Pickens', pos: 'WR', team: 'DAL', age: 24, exp: 4, prod: 76, usage: 78, opp: 78, eff: 82, role: 74, off: 70, td: 36, inj: 22, hype: 58, games: 16, mis: 3, cats: [cat(7, 'depth_chart_change', 'bullish', 'moderate', 'Clear WR2 role in a high-volume passing game', 'New environment stabilizes the target outlook.', ['opportunity', 'offense'])] },
  { ticker: 'JWN', name: 'Jameson Williams', pos: 'WR', team: 'DET', age: 24, exp: 4, prod: 74, usage: 68, opp: 70, eff: 88, role: 54, off: 86, td: 86, inj: 30, hype: 62, games: 15, mis: -6, cats: [cat(10, 'touchdown_bubble', 'bearish', 'moderate', 'Big-play rate props up the scoring line', 'Explosive but volatile; a weekly boom-bust profile that swings the value.', ['efficiency'])] },
  { ticker: 'CAK', name: 'Cooper Kupp', pos: 'WR', team: 'SEA', age: 32, exp: 9, prod: 74, usage: 78, opp: 78, eff: 80, role: 78, off: 62, td: 32, inj: 62, hype: 40, games: 12, mis: -14, cats: [cat(12, 'age_curve_milestone', 'bearish', 'moderate', 'Injury history and age compress the window', 'Still productive when healthy, but durability and age weigh on dynasty value.', ['injury', 'production'])] },
  { ticker: 'XWO', name: 'Xavier Worthy', pos: 'WR', team: 'KC', age: 22, exp: 2, prod: 74, usage: 78, opp: 80, eff: 82, role: 82, off: 82, td: 30, inj: 18, hype: 64, games: 16, mis: 28, cats: [cat(6, 'role_spike', 'bullish', 'major', 'Route share climbs in a premier offense', 'A second-year usage jump inside an elite passing attack; the market is slow to reprice it.', ['usage', 'opportunity'])] },
  { ticker: 'KEA', name: 'Keon Coleman', pos: 'WR', team: 'BUF', age: 22, exp: 2, prod: 68, usage: 74, opp: 76, eff: 74, role: 76, off: 82, td: 36, inj: 20, hype: 52, games: 15, mis: 6 },
  { ticker: 'JAD', name: 'Jaylen Waddle', pos: 'WR', team: 'MIA', age: 27, exp: 5, prod: 76, usage: 80, opp: 80, eff: 82, role: 80, off: 60, td: 30, inj: 30, hype: 42, games: 15, mis: -2 },
  { ticker: 'DEA', name: 'DJ Moore', pos: 'WR', team: 'CHI', age: 28, exp: 8, prod: 78, usage: 82, opp: 82, eff: 80, role: 82, off: 56, td: 32, inj: 20, hype: 42, games: 17, mis: -4 },
  { ticker: 'CAS', name: 'Calvin Ridley', pos: 'WR', team: 'TEN', age: 31, exp: 8, prod: 72, usage: 78, opp: 78, eff: 76, role: 78, off: 46, td: 34, inj: 30, hype: 38, games: 16, mis: -8 },

  // ---------------- Strong starters (RB) ----------------
  { ticker: 'SBY', name: 'Saquon Barkley', pos: 'RB', team: 'PHI', age: 28, exp: 8, prod: 92, usage: 88, opp: 90, eff: 90, role: 88, off: 82, td: 44, inj: 34, hype: 66, games: 16, mis: -6, cats: [cat(9, 'unsustainable_td_rate', 'bearish', 'minor', 'Historic TD volume unlikely to fully repeat', 'League-winning season bakes some regression risk into the price.', ['efficiency'])] },
  { ticker: 'CMC', name: 'Christian McCaffrey', pos: 'RB', team: 'SF', age: 29, exp: 9, status: 'questionable', prod: 88, usage: 86, opp: 90, eff: 88, role: 88, off: 76, td: 42, inj: 66, hype: 54, games: 9, mis: 12, cats: [cat(8, 'injury_recovery', 'bullish', 'moderate', 'Back to full practice after lost season', 'Elite when healthy; the market discount opens a buy-low case with real risk.', ['injury', 'roleSecurity'])] },
  { ticker: 'JCB', name: 'Jonathan Taylor', pos: 'RB', team: 'IND', age: 26, exp: 6, prod: 88, usage: 86, opp: 88, eff: 86, role: 86, off: 60, td: 42, inj: 30, hype: 56, games: 15, mis: 6 },
  { ticker: 'DEH', name: "De'Von Achane", pos: 'RB', team: 'MIA', age: 24, exp: 3, prod: 82, usage: 74, opp: 78, eff: 92, role: 58, off: 60, td: 82, inj: 30, hype: 68, games: 16, mis: -7, cats: [cat(10, 'touchdown_bubble', 'bearish', 'moderate', 'Efficiency-driven line invites regression', 'Explosive on limited volume; a boom-bust weekly profile.', ['efficiency'])] },
  { ticker: 'KYW', name: 'Kyren Williams', pos: 'RB', team: 'LAR', age: 25, exp: 4, prod: 84, usage: 82, opp: 84, eff: 78, role: 82, off: 70, td: 46, inj: 24, hype: 50, games: 17, mis: -6 },
  { ticker: 'JGB', name: 'Josh Jacobs', pos: 'RB', team: 'GB', age: 27, exp: 7, prod: 84, usage: 82, opp: 84, eff: 80, role: 84, off: 78, td: 46, inj: 26, hype: 48, games: 17, mis: -4 },
  { ticker: 'BRW', name: 'Bucky Irving', pos: 'RB', team: 'TB', age: 23, exp: 2, prod: 82, usage: 80, opp: 82, eff: 88, role: 82, off: 70, td: 34, inj: 22, hype: 62, games: 16, mis: 10, cats: [cat(7, 'role_security_improvement', 'bullish', 'moderate', 'Takes over the backfield workload', 'A three-down role solidified the every-week floor.', ['usage', 'roleSecurity'])] },
  { ticker: 'CBR', name: 'Chase Brown', pos: 'RB', team: 'CIN', age: 25, exp: 3, prod: 82, usage: 82, opp: 82, eff: 80, role: 82, off: 78, td: 42, inj: 24, hype: 52, games: 16, mis: 4 },
  { ticker: 'BHL', name: 'Breece Hall', pos: 'RB', team: 'NYJ', age: 24, exp: 4, prod: 80, usage: 82, opp: 84, eff: 78, role: 80, off: 46, td: 34, inj: 40, hype: 54, games: 16, mis: 6 },
  { ticker: 'JCG', name: 'James Cook', pos: 'RB', team: 'BUF', age: 26, exp: 4, prod: 82, usage: 78, opp: 80, eff: 82, role: 80, off: 84, td: 50, inj: 22, hype: 50, games: 17, mis: -8, cats: [cat(9, 'unsustainable_td_rate', 'bearish', 'moderate', 'Touchdown share tops the position', 'A large slice of value sits on hard-to-repeat scoring.', ['efficiency'])] },
  { ticker: 'OMT', name: 'Omarion Hampton', pos: 'RB', team: 'LAC', age: 22, exp: 1, rookie: true, prod: 74, usage: 78, opp: 80, eff: 74, role: 80, off: 64, td: 38, inj: 20, hype: 66, games: 0, mis: 5, cats: [cat(14, 'rookie_competition_added', 'bullish', 'moderate', 'Projected early-down lead role', 'Draft capital points to immediate volume.', ['opportunity'])] },
  { ticker: 'TBP', name: 'TreVeyon Henderson', pos: 'RB', team: 'NE', age: 22, exp: 1, rookie: true, prod: 70, usage: 72, opp: 76, eff: 84, role: 72, off: 54, td: 34, inj: 22, hype: 64, games: 0, mis: 2, cats: [cat(15, 'rookie_competition_added', 'bearish', 'minor', 'Committee backfield clouds the workload', 'Talented, but the touch share is unsettled to open the year.', ['roleSecurity'])] },
  { ticker: 'RJH', name: 'RJ Harvey', pos: 'RB', team: 'DEN', age: 24, exp: 1, rookie: true, prod: 66, usage: 70, opp: 74, eff: 80, role: 72, off: 66, td: 36, inj: 20, hype: 58, games: 0, mis: 4 },
  { ticker: 'KWJ', name: 'Kenneth Walker III', pos: 'RB', team: 'SEA', age: 25, exp: 4, status: 'questionable', prod: 78, usage: 76, opp: 78, eff: 80, role: 74, off: 62, td: 40, inj: 48, hype: 46, games: 12, mis: 8 },
  { ticker: 'ISP', name: 'Isiah Pacheco', pos: 'RB', team: 'KC', age: 26, exp: 4, prod: 74, usage: 74, opp: 76, eff: 76, role: 74, off: 80, td: 40, inj: 40, hype: 42, games: 13, mis: 2 },
  { ticker: 'AJD', name: 'Alvin Kamara', pos: 'RB', team: 'NO', age: 30, exp: 9, prod: 78, usage: 80, opp: 82, eff: 76, role: 80, off: 50, td: 36, inj: 34, hype: 40, games: 15, mis: -14, cats: [cat(11, 'age_curve_milestone', 'bearish', 'moderate', 'RB age cliff enters the valuation', 'Still a workload hog, but 30-year-old backs carry steep decline risk.', ['production'])] },
  { ticker: 'DAM', name: 'David Montgomery', pos: 'RB', team: 'DET', age: 28, exp: 7, prod: 74, usage: 72, opp: 74, eff: 74, role: 74, off: 86, td: 52, inj: 30, hype: 38, games: 15, mis: -10, cats: [cat(10, 'touchdown_bubble', 'bearish', 'moderate', 'Goal-line role inflates the scoring', 'Touchdown-dependent value in a committee.', ['efficiency'])] },
  { ticker: 'TNB', name: 'Tony Pollard', pos: 'RB', team: 'TEN', age: 28, exp: 7, prod: 72, usage: 76, opp: 76, eff: 74, role: 76, off: 46, td: 34, inj: 24, hype: 36, games: 16, mis: -2 },
  { ticker: 'ZCH', name: 'Zach Charbonnet', pos: 'RB', team: 'SEA', age: 25, exp: 3, prod: 66, usage: 62, opp: 68, eff: 78, role: 60, off: 62, td: 38, inj: 22, hype: 48, games: 16, mis: 12, cats: [cat(6, 'teammate_injury', 'bullish', 'moderate', 'One injury from a bellcow role', 'A high-value handcuff with standalone flex appeal.', ['opportunity', 'roleSecurity'])] },
  { ticker: 'JBP', name: 'Jaylen Warren', pos: 'RB', team: 'PIT', age: 26, exp: 4, prod: 68, usage: 68, opp: 72, eff: 80, role: 66, off: 58, td: 30, inj: 22, hype: 44, games: 16, mis: 6 },
  { ticker: 'RMD', name: 'Rhamondre Stevenson', pos: 'RB', team: 'NE', age: 27, exp: 5, prod: 66, usage: 70, opp: 72, eff: 66, role: 68, off: 54, td: 34, inj: 30, hype: 34, games: 15, mis: -6 },
  { ticker: 'BRB', name: 'Brian Robinson Jr.', pos: 'RB', team: 'WAS', age: 26, exp: 4, prod: 66, usage: 68, opp: 70, eff: 68, role: 68, off: 66, td: 42, inj: 26, hype: 34, games: 16, mis: -4 },

  // ---------------- Quarterbacks ----------------
  { ticker: 'JBH', name: 'Jayden Daniels', pos: 'QB', team: 'WAS', age: 25, exp: 2, prod: 92, usage: 90, opp: 84, eff: 88, role: 94, off: 72, td: 30, inj: 34, hype: 74, games: 16, mis: 6, cats: [cat(9, 'role_security_improvement', 'bullish', 'moderate', 'Dual-threat usage locks in an elite floor', 'Rushing volume makes him a franchise SF cornerstone.', ['usage', 'roleSecurity'])] },
  { ticker: 'JHU', name: 'Jalen Hurts', pos: 'QB', team: 'PHI', age: 27, exp: 6, prod: 90, usage: 90, opp: 82, eff: 84, role: 94, off: 82, td: 34, inj: 26, hype: 56, games: 16, mis: -2 },
  { ticker: 'JBW', name: 'Joe Burrow', pos: 'QB', team: 'CIN', age: 29, exp: 6, prod: 92, usage: 82, opp: 84, eff: 92, role: 94, off: 78, td: 24, inj: 44, hype: 58, games: 15, mis: 4 },
  { ticker: 'CJS', name: 'C.J. Stroud', pos: 'QB', team: 'HOU', age: 24, exp: 3, prod: 82, usage: 78, opp: 80, eff: 82, role: 92, off: 66, td: 24, inj: 24, hype: 58, games: 16, mis: 8, cats: [cat(8, 'efficiency_regression', 'bearish', 'minor', 'Sophomore dip pressures the price', 'A step back in efficiency created a cheaper entry on a young franchise QB.', ['efficiency'])] },
  { ticker: 'ANR', name: 'Anthony Richardson', pos: 'QB', team: 'IND', age: 23, exp: 3, status: 'questionable', prod: 70, usage: 84, opp: 74, eff: 58, role: 52, off: 58, td: 44, inj: 56, hype: 70, games: 9, mis: 2, cats: [cat(12, 'role_security_improvement', 'bearish', 'moderate', 'Job security wobbles after benching', 'Rushing upside is real, but accuracy and role risk cloud the outlook — a volatile weekly ride.', ['roleSecurity', 'efficiency'])] },
  { ticker: 'CWN', name: 'Caleb Williams', pos: 'QB', team: 'CHI', age: 24, exp: 2, prod: 78, usage: 80, opp: 80, eff: 76, role: 90, off: 62, td: 26, inj: 22, hype: 70, games: 17, mis: 6 },
  { ticker: 'DRP', name: 'Drake Maye', pos: 'QB', team: 'NE', age: 23, exp: 2, prod: 76, usage: 82, opp: 76, eff: 74, role: 90, off: 52, td: 26, inj: 24, hype: 62, games: 15, mis: 9, cats: [cat(7, 'offensive_line_change', 'bullish', 'moderate', 'Rebuilt supporting cast raises the ceiling', 'Improved environment points to a second-year jump.', ['offense'])] },
  { ticker: 'BNX', name: 'Bo Nix', pos: 'QB', team: 'DEN', age: 25, exp: 2, prod: 74, usage: 74, opp: 76, eff: 78, role: 84, off: 70, td: 26, inj: 20, hype: 54, games: 17, mis: 2 },
  { ticker: 'KYM', name: 'Kyler Murray', pos: 'QB', team: 'ARI', age: 28, exp: 7, prod: 76, usage: 82, opp: 76, eff: 76, role: 84, off: 60, td: 28, inj: 34, hype: 44, games: 16, mis: -4 },
  { ticker: 'BRP', name: 'Brock Purdy', pos: 'QB', team: 'SF', age: 26, exp: 4, prod: 74, usage: 68, opp: 74, eff: 86, role: 82, off: 78, td: 24, inj: 26, hype: 44, games: 15, mis: -2 },
  { ticker: 'DKP', name: 'Dak Prescott', pos: 'QB', team: 'DAL', age: 32, exp: 10, prod: 74, usage: 68, opp: 76, eff: 82, role: 84, off: 70, td: 24, inj: 40, hype: 40, games: 12, mis: -6 },
  { ticker: 'JGF', name: 'Jared Goff', pos: 'QB', team: 'DET', age: 31, exp: 10, prod: 76, usage: 62, opp: 78, eff: 86, role: 84, off: 88, td: 22, inj: 18, hype: 42, games: 17, mis: -6, cats: [cat(10, 'age_curve_milestone', 'bearish', 'minor', 'Pocket passer age curve caps dynasty upside', 'Great real-life QB, limited long-term dynasty appreciation.', ['production'])] },
  { ticker: 'TTG', name: 'Trevor Lawrence', pos: 'QB', team: 'JAX', age: 26, exp: 5, prod: 74, usage: 76, opp: 76, eff: 72, role: 90, off: 56, td: 24, inj: 30, hype: 50, games: 15, mis: 8 },
  { ticker: 'JJM', name: 'J.J. McCarthy', pos: 'QB', team: 'MIN', age: 22, exp: 2, prod: 66, usage: 70, opp: 74, eff: 70, role: 84, off: 76, td: 24, inj: 30, hype: 62, games: 6, mis: 10, cats: [cat(6, 'role_spike', 'bullish', 'moderate', 'Takes the reins of a loaded offense', 'Cheap entry on a young QB in a strong environment.', ['offense', 'roleSecurity'])] },
  { ticker: 'MPN', name: 'Michael Penix Jr.', pos: 'QB', team: 'ATL', age: 25, exp: 2, prod: 68, usage: 68, opp: 74, eff: 74, role: 82, off: 70, td: 24, inj: 24, hype: 52, games: 8, mis: 6 },

  // ---------------- Tight ends ----------------
  { ticker: 'MAN', name: 'Trey McBride', pos: 'TE', team: 'ARI', age: 26, exp: 4, prod: 86, usage: 88, opp: 86, eff: 82, role: 90, off: 58, td: 28, inj: 20, hype: 54, games: 16, mis: 8, cats: [cat(8, 'target_share_change', 'bullish', 'moderate', 'Target share rivals a WR1', 'Elite volume gives a rare positional edge.', ['opportunity', 'usage'])] },
  { ticker: 'GKT', name: 'George Kittle', pos: 'TE', team: 'SF', age: 32, exp: 9, prod: 82, usage: 78, opp: 78, eff: 90, role: 84, off: 78, td: 40, inj: 40, hype: 46, games: 15, mis: -10, cats: [cat(10, 'age_curve_milestone', 'bearish', 'moderate', 'Age curve steepens for an elite TE', 'Still dominant, but the dynasty runway is short.', ['production'])] },
  { ticker: 'SLB', name: 'Sam LaPorta', pos: 'TE', team: 'DET', age: 24, exp: 3, prod: 80, usage: 82, opp: 80, eff: 80, role: 84, off: 86, td: 34, inj: 24, hype: 52, games: 16, mis: 6 },
  { ticker: 'TKL', name: 'Travis Kelce', pos: 'TE', team: 'KC', age: 36, exp: 13, prod: 74, usage: 78, opp: 78, eff: 76, role: 80, off: 80, td: 34, inj: 26, hype: 44, games: 16, mis: -22, cats: [cat(9, 'age_curve_milestone', 'bearish', 'major', 'Legend price meets the age cliff', 'Productive, but dynasty value is a rapidly wasting asset at 36.', ['production'])] },
  { ticker: 'DAG', name: 'Dalton Kincaid', pos: 'TE', team: 'BUF', age: 25, exp: 3, prod: 68, usage: 74, opp: 74, eff: 72, role: 74, off: 84, td: 30, inj: 26, hype: 50, games: 14, mis: 10, cats: [cat(7, 'role_spike', 'bullish', 'moderate', 'Route share trends up in camp', 'A cheaper bet on a young TE in a strong offense.', ['usage'])] },
  { ticker: 'TCB', name: 'T.J. Hockenson', pos: 'TE', team: 'MIN', age: 28, exp: 7, prod: 74, usage: 78, opp: 78, eff: 76, role: 80, off: 76, td: 28, inj: 44, hype: 40, games: 12, mis: 2 },
  { ticker: 'DWL', name: 'David Njoku', pos: 'TE', team: 'CLE', age: 29, exp: 9, prod: 72, usage: 78, opp: 78, eff: 74, role: 80, off: 46, td: 30, inj: 30, hype: 38, games: 14, mis: -4 },
  { ticker: 'EVG', name: 'Evan Engram', pos: 'TE', team: 'DEN', age: 31, exp: 9, prod: 70, usage: 78, opp: 78, eff: 72, role: 78, off: 66, td: 24, inj: 34, hype: 34, games: 13, mis: -8 },
  { ticker: 'LOV', name: 'Colston Loveland', pos: 'TE', team: 'CHI', age: 21, exp: 1, rookie: true, prod: 58, usage: 62, opp: 66, eff: 68, role: 64, off: 60, td: 28, inj: 20, hype: 56, games: 0, mis: 3 },
  { ticker: 'TWR', name: 'Tyler Warren', pos: 'TE', team: 'IND', age: 23, exp: 1, rookie: true, prod: 60, usage: 66, opp: 70, eff: 66, role: 68, off: 56, td: 30, inj: 20, hype: 60, games: 0, mis: 5, cats: [cat(13, 'rookie_competition_added', 'bullish', 'minor', 'Every-down role projected early', 'Draft capital and usage profile suggest immediate targets.', ['opportunity'])] },

  // ---------------- Rookie IPOs (WR/skill) ----------------
  { ticker: 'TET', name: 'Tetairoa McMillan', pos: 'WR', team: 'CAR', age: 22, exp: 1, rookie: true, prod: 64, usage: 72, opp: 76, eff: 70, role: 76, off: 44, td: 30, inj: 20, hype: 66, games: 0, mis: 4, cats: [cat(12, 'rookie_competition_added', 'bullish', 'moderate', 'Projected day-one alpha target', 'Size and draft capital point to immediate WR1 volume.', ['opportunity'])] },
  { ticker: 'EMT', name: 'Emeka Egbuka', pos: 'WR', team: 'TB', age: 22, exp: 1, rookie: true, prod: 62, usage: 70, opp: 74, eff: 74, role: 74, off: 66, td: 30, inj: 18, hype: 58, games: 0, mis: 3 },
  { ticker: 'MTG', name: 'Matthew Golden', pos: 'WR', team: 'GB', age: 22, exp: 1, rookie: true, prod: 58, usage: 66, opp: 70, eff: 76, role: 70, off: 74, td: 32, inj: 18, hype: 54, games: 0, mis: 2 },
  { ticker: 'LNT', name: 'Luther Burden III', pos: 'WR', team: 'CHI', age: 22, exp: 1, rookie: true, prod: 56, usage: 64, opp: 70, eff: 74, role: 66, off: 60, td: 30, inj: 18, hype: 52, games: 0, mis: 3 },
  { ticker: 'TRS', name: 'Travis Hunter', pos: 'WR', team: 'JAX', age: 22, exp: 1, rookie: true, prod: 60, usage: 66, opp: 72, eff: 72, role: 68, off: 54, td: 30, inj: 22, hype: 78, games: 0, mis: -8, cats: [cat(11, 'hype_surge', 'bearish', 'moderate', 'Two-way role clouds the target projection', 'Elite talent, but snap allocation on offense is uncertain.', ['roleSecurity', 'opportunity'])] },

  // ---------------- Aging veterans / Dividend / Age Cliff ----------------
  { ticker: 'AAB', name: 'Aaron Jones', pos: 'RB', team: 'MIN', age: 31, exp: 8, prod: 72, usage: 74, opp: 74, eff: 74, role: 74, off: 76, td: 36, inj: 40, hype: 34, games: 14, mis: -16, cats: [cat(9, 'age_curve_milestone', 'bearish', 'moderate', 'Age and workload history compress value', 'Reliable when healthy, but the RB cliff is here.', ['production', 'injury'])] },
  { ticker: 'JMX', name: 'Joe Mixon', pos: 'RB', team: 'HOU', age: 29, exp: 8, status: 'ir_short', prod: 90, usage: 84, opp: 86, eff: 78, role: 40, off: 56, td: 52, inj: 90, hype: 46, games: 9, mis: -26, cats: [cat(8, 'own_injury', 'bearish', 'major', 'Foot injury lands him on IR with a cloudy timeline', 'Aging back, lost role, and a value that still asks buyers to pay up — a value trap.', ['injury', 'roleSecurity'])] },
  { ticker: 'DEK', name: 'Derrick Henry', pos: 'RB', team: 'BAL', age: 31, exp: 10, prod: 86, usage: 78, opp: 78, eff: 82, role: 82, off: 82, td: 54, inj: 26, hype: 50, games: 16, mis: -18, cats: [cat(8, 'unsustainable_td_rate', 'bearish', 'moderate', 'Historic TD pace meets the age cliff', 'Still elite, but 31-year-old backs are wasting dynasty assets.', ['efficiency', 'production'])] },
  { ticker: 'KAL', name: 'Keenan Allen', pos: 'WR', team: 'LAC', age: 33, exp: 12, prod: 70, usage: 78, opp: 78, eff: 74, role: 76, off: 60, td: 26, inj: 40, hype: 30, games: 13, mis: -14 },
  { ticker: 'ADT', name: 'Adam Thielen', pos: 'WR', team: 'MIN', age: 35, exp: 12, prod: 60, usage: 66, opp: 68, eff: 68, role: 66, off: 70, td: 30, inj: 40, hype: 24, games: 12, mis: -10 },
  { ticker: 'EKL', name: 'Austin Ekeler', pos: 'RB', team: 'WAS', age: 30, exp: 8, prod: 64, usage: 68, opp: 72, eff: 70, role: 66, off: 70, td: 30, inj: 44, hype: 30, games: 13, mis: -8 },

  // ---------------- Volatile / TD-dependent / Touchdown Bubble ----------------
  { ticker: 'RRC', name: 'Rashee Rice', pos: 'WR', team: 'KC', age: 25, exp: 3, status: 'questionable', prod: 76, usage: 82, opp: 82, eff: 82, role: 80, off: 80, td: 34, inj: 46, hype: 62, games: 7, mis: 14, cats: [cat(6, 'injury_recovery', 'bullish', 'moderate', 'On track to return to a featured role', 'A discounted price on a target earner in an elite offense.', ['injury', 'opportunity'])] },
  { ticker: 'JDW', name: 'Jordan Addison', pos: 'WR', team: 'MIN', age: 23, exp: 3, prod: 74, usage: 76, opp: 76, eff: 80, role: 76, off: 76, td: 44, inj: 22, hype: 52, games: 15, mis: -6 },
  { ticker: 'CGN', name: 'Courtland Sutton', pos: 'WR', team: 'DEN', age: 30, exp: 8, prod: 76, usage: 80, opp: 80, eff: 74, role: 80, off: 70, td: 48, inj: 24, hype: 40, games: 16, mis: -10, cats: [cat(9, 'touchdown_bubble', 'bearish', 'moderate', 'Scoring line leans on red-zone luck', 'Volume is fine; the touchdown rate likely regresses.', ['efficiency'])] },
  { ticker: 'JTN', name: 'Jauan Jennings', pos: 'WR', team: 'SF', age: 28, exp: 6, prod: 66, usage: 70, opp: 72, eff: 74, role: 66, off: 78, td: 40, inj: 28, hype: 44, games: 14, mis: -8 },
  { ticker: 'WDR', name: 'Wan\'Dale Robinson', pos: 'WR', team: 'NYG', age: 25, exp: 4, prod: 62, usage: 76, opp: 74, eff: 66, role: 72, off: 40, td: 22, inj: 26, hype: 38, games: 16, mis: 4 },
  { ticker: 'KHJ', name: 'Khalil Shakir', pos: 'WR', team: 'BUF', age: 25, exp: 4, prod: 68, usage: 72, opp: 72, eff: 82, role: 74, off: 82, td: 28, inj: 20, hype: 42, games: 16, mis: 2 },
  { ticker: 'RTM', name: 'Romeo Doubs', pos: 'WR', team: 'GB', age: 25, exp: 4, prod: 60, usage: 66, opp: 68, eff: 70, role: 64, off: 74, td: 38, inj: 24, hype: 34, games: 15, mis: -6 },

  // ---------------- Deep stashes / Penny Stocks / breakout darts ----------------
  { ticker: 'TBG', name: 'Tank Bigsby', pos: 'RB', team: 'JAX', age: 24, exp: 3, prod: 58, usage: 54, opp: 60, eff: 70, role: 52, off: 56, td: 40, inj: 22, hype: 44, games: 16, mis: 8, cats: [cat(6, 'teammate_injury', 'bullish', 'moderate', 'A backfield injury away from volume', 'Standalone value is thin, but the upside is real.', ['opportunity'])] },
  { ticker: 'RSH', name: 'Roschon Johnson', pos: 'RB', team: 'CHI', age: 24, exp: 3, prod: 52, usage: 48, opp: 56, eff: 66, role: 50, off: 62, td: 44, inj: 22, hype: 36, games: 16, mis: 4 },
  { ticker: 'TBN', name: 'Tyjae Spears', pos: 'RB', team: 'TEN', age: 24, exp: 3, prod: 56, usage: 54, opp: 62, eff: 74, role: 52, off: 46, td: 34, inj: 32, hype: 40, games: 14, mis: 6 },
  { ticker: 'BLM', name: 'Blake Corum', pos: 'RB', team: 'LAR', age: 24, exp: 2, prod: 50, usage: 46, opp: 56, eff: 68, role: 48, off: 70, td: 36, inj: 20, hype: 42, games: 15, mis: 10, cats: [cat(7, 'teammate_injury', 'bullish', 'minor', 'High-value handcuff to a workhorse', 'Immediate RB1 upside if the starter misses time.', ['opportunity', 'roleSecurity'])] },
  { ticker: 'JLM', name: 'Jalen McMillan', pos: 'WR', team: 'TB', age: 23, exp: 2, prod: 56, usage: 60, opp: 64, eff: 72, role: 60, off: 66, td: 40, inj: 20, hype: 44, games: 15, mis: 6 },
  { ticker: 'DDL', name: 'Dontayvion Wicks', pos: 'WR', team: 'GB', age: 24, exp: 3, prod: 48, usage: 54, opp: 58, eff: 66, role: 54, off: 74, td: 34, inj: 20, hype: 30, games: 15, mis: 2 },
  { ticker: 'RPS', name: 'Ricky Pearsall', pos: 'WR', team: 'SF', age: 24, exp: 2, prod: 58, usage: 64, opp: 66, eff: 72, role: 64, off: 78, td: 30, inj: 30, hype: 48, games: 11, mis: 8, cats: [cat(6, 'role_spike', 'bullish', 'moderate', 'Path to a starting role opens up', 'Depth-chart movement points to a usage bump.', ['usage', 'opportunity'])] },
  { ticker: 'AJT', name: 'Adonai Mitchell', pos: 'WR', team: 'IND', age: 23, exp: 2, prod: 46, usage: 52, opp: 58, eff: 70, role: 52, off: 60, td: 36, inj: 18, hype: 40, games: 14, mis: 6 },
  { ticker: 'MWP', name: 'Marvin Mims Jr.', pos: 'WR', team: 'DEN', age: 23, exp: 3, prod: 56, usage: 54, opp: 58, eff: 84, role: 46, off: 70, td: 88, inj: 20, hype: 50, games: 16, mis: 1, cats: [cat(8, 'touchdown_bubble', 'bearish', 'minor', 'Big plays carry a thin target share', 'Explosive, but the role is still situational — the value swings week to week.', ['efficiency'])] },
  { ticker: 'QJW', name: 'Quentin Johnston', pos: 'WR', team: 'LAC', age: 24, exp: 3, prod: 56, usage: 62, opp: 64, eff: 60, role: 62, off: 64, td: 46, inj: 20, hype: 38, games: 15, mis: -8 },
  { ticker: 'JFR', name: 'Jerry Jeudy', pos: 'WR', team: 'CLE', age: 26, exp: 6, prod: 68, usage: 76, opp: 76, eff: 72, role: 76, off: 42, td: 28, inj: 22, hype: 40, games: 16, mis: 4 },
  { ticker: 'CBH', name: 'Cam Skattebo', pos: 'RB', team: 'NYG', age: 23, exp: 1, rookie: true, prod: 54, usage: 58, opp: 64, eff: 66, role: 62, off: 42, td: 36, inj: 20, hype: 52, games: 0, mis: 4 },
  { ticker: 'KMB', name: 'Kaleb Johnson', pos: 'RB', team: 'PIT', age: 22, exp: 1, rookie: true, prod: 52, usage: 56, opp: 62, eff: 68, role: 60, off: 58, td: 38, inj: 18, hype: 50, games: 0, mis: 5 },
  { ticker: 'DJT', name: 'Dylan Sampson', pos: 'RB', team: 'CLE', age: 21, exp: 1, rookie: true, prod: 48, usage: 50, opp: 58, eff: 70, role: 54, off: 44, td: 34, inj: 18, hype: 46, games: 0, mis: 3 },
  { ticker: 'JHL', name: 'Jaylen Wright', pos: 'RB', team: 'MIA', age: 22, exp: 2, prod: 48, usage: 44, opp: 54, eff: 76, role: 46, off: 60, td: 34, inj: 20, hype: 44, games: 15, mis: 8 },
  { ticker: 'MPR', name: 'MarShawn Lloyd', pos: 'RB', team: 'GB', age: 24, exp: 2, prod: 44, usage: 40, opp: 52, eff: 72, role: 44, off: 74, td: 34, inj: 40, hype: 42, games: 6, mis: 10 },
  { ticker: 'JFS', name: 'Jayden Reed', pos: 'WR', team: 'GB', age: 25, exp: 3, prod: 66, usage: 70, opp: 70, eff: 80, role: 70, off: 74, td: 42, inj: 24, hype: 46, games: 15, mis: -4 },
  { ticker: 'DPK', name: 'Deebo Samuel', pos: 'WR', team: 'WAS', age: 29, exp: 7, prod: 72, usage: 76, opp: 76, eff: 74, role: 74, off: 72, td: 40, inj: 44, hype: 42, games: 14, mis: -8 },
  { ticker: 'CKR', name: 'Christian Kirk', pos: 'WR', team: 'HOU', age: 29, exp: 8, prod: 62, usage: 72, opp: 72, eff: 74, role: 72, off: 66, td: 30, inj: 40, hype: 32, games: 12, mis: -4 },
  { ticker: 'DHW', name: 'Diontae Johnson', pos: 'WR', team: 'CLE', age: 29, exp: 7, prod: 58, usage: 70, opp: 70, eff: 68, role: 60, off: 44, td: 28, inj: 30, hype: 30, games: 14, mis: -10, cats: [cat(9, 'role_security_improvement', 'bearish', 'moderate', 'Bounced between teams; role uncertain', 'Talent is there, but the situation and effort questions weigh.', ['roleSecurity'])] },
  { ticker: 'PSK', name: 'Pat Freiermuth', pos: 'TE', team: 'PIT', age: 27, exp: 5, prod: 62, usage: 70, opp: 70, eff: 72, role: 74, off: 58, td: 32, inj: 24, hype: 34, games: 16, mis: 2 },
  { ticker: 'JCS', name: 'Jake Ferguson', pos: 'TE', team: 'DAL', age: 26, exp: 4, prod: 64, usage: 72, opp: 72, eff: 70, role: 76, off: 70, td: 28, inj: 26, hype: 36, games: 14, mis: 4 },
  { ticker: 'CDX', name: 'Cade Otton', pos: 'TE', team: 'TB', age: 26, exp: 4, prod: 58, usage: 68, opp: 68, eff: 66, role: 72, off: 66, td: 30, inj: 22, hype: 30, games: 15, mis: 2 },
  { ticker: 'DAW', name: 'Dallas Goedert', pos: 'TE', team: 'PHI', age: 30, exp: 8, prod: 66, usage: 72, opp: 72, eff: 74, role: 74, off: 78, td: 30, inj: 40, hype: 32, games: 12, mis: -6 },
  { ticker: 'HHN', name: 'Hunter Henry', pos: 'TE', team: 'NE', age: 31, exp: 10, prod: 60, usage: 70, opp: 70, eff: 70, role: 74, off: 52, td: 30, inj: 26, hype: 28, games: 16, mis: -6 },
  { ticker: 'ZMB', name: 'Zach Ertz', pos: 'TE', team: 'WAS', age: 35, exp: 13, prod: 60, usage: 72, opp: 72, eff: 66, role: 72, off: 66, td: 34, inj: 26, hype: 26, games: 16, mis: -12, cats: [cat(10, 'age_curve_milestone', 'bearish', 'moderate', 'Productive now, no dynasty runway', 'Useful redraft piece; a wasting asset in dynasty.', ['production'])] },
  { ticker: 'TUA', name: 'Tua Tagovailoa', pos: 'QB', team: 'MIA', age: 27, exp: 6, status: 'questionable', prod: 70, usage: 64, opp: 74, eff: 82, role: 78, off: 62, td: 22, inj: 58, hype: 40, games: 11, mis: 6 },
  { ticker: 'MSF', name: 'Matthew Stafford', pos: 'QB', team: 'LAR', age: 37, exp: 16, prod: 66, usage: 60, opp: 74, eff: 82, role: 78, off: 72, td: 22, inj: 40, hype: 34, games: 15, mis: -16, cats: [cat(9, 'age_curve_milestone', 'bearish', 'major', 'Elite arm, near-zero dynasty runway', 'Great redraft QB; dynasty value is minimal at 37.', ['production'])] },
  { ticker: 'GWN', name: 'Geno Smith', pos: 'QB', team: 'LV', age: 35, exp: 12, prod: 62, usage: 60, opp: 72, eff: 76, role: 76, off: 58, td: 22, inj: 24, hype: 30, games: 16, mis: -8 },
  { ticker: 'RWL', name: 'Russell Wilson', pos: 'QB', team: 'NYG', age: 37, exp: 14, prod: 54, usage: 58, opp: 66, eff: 68, role: 66, off: 46, td: 26, inj: 28, hype: 28, games: 14, mis: -12 },
  { ticker: 'FLD', name: 'Justin Fields', pos: 'QB', team: 'NYJ', age: 26, exp: 5, prod: 74, usage: 88, opp: 76, eff: 70, role: 78, off: 52, td: 30, inj: 26, hype: 54, games: 14, mis: 8, cats: [cat(7, 'role_spike', 'bullish', 'moderate', 'Rushing role revives the QB1 upside', 'Legs give a high weekly ceiling in a new starting job.', ['usage'])] },
  { ticker: 'WLV', name: 'Will Levis', pos: 'QB', team: 'TEN', age: 26, exp: 3, prod: 58, usage: 66, opp: 68, eff: 60, role: 68, off: 44, td: 28, inj: 26, hype: 34, games: 12, mis: -8 },
  { ticker: 'TDN', name: 'Tyler Allgeier', pos: 'RB', team: 'ATL', age: 25, exp: 4, prod: 54, usage: 48, opp: 56, eff: 70, role: 50, off: 72, td: 40, inj: 20, hype: 32, games: 16, mis: 4 },
  { ticker: 'RAY', name: 'Ray Davis', pos: 'RB', team: 'BUF', age: 25, exp: 2, prod: 46, usage: 42, opp: 52, eff: 68, role: 44, off: 82, td: 40, inj: 20, hype: 38, games: 15, mis: 6 },
  { ticker: 'ELW', name: 'Elijah Moore', pos: 'WR', team: 'BUF', age: 25, exp: 5, prod: 56, usage: 64, opp: 66, eff: 70, role: 62, off: 82, td: 28, inj: 22, hype: 36, games: 15, mis: 2 },
  { ticker: 'DPS', name: 'Darnell Mooney', pos: 'WR', team: 'ATL', age: 28, exp: 6, prod: 64, usage: 68, opp: 70, eff: 78, role: 70, off: 68, td: 40, inj: 26, hype: 34, games: 15, mis: -6 },
  { ticker: 'RTB', name: 'Rashid Shaheed', pos: 'WR', team: 'NO', age: 27, exp: 4, prod: 60, usage: 62, opp: 64, eff: 86, role: 64, off: 48, td: 44, inj: 30, hype: 40, games: 12, mis: -6 },
  { ticker: 'DBN', name: 'Demario Douglas', pos: 'WR', team: 'NE', age: 24, exp: 3, prod: 54, usage: 64, opp: 66, eff: 70, role: 64, off: 52, td: 22, inj: 20, hype: 34, games: 16, mis: 2 },
];
