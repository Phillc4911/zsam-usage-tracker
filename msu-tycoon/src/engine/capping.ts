import type { CappingPlan, Lpar, LparId } from './types';
import { INTERVALS_PER_DAY, INTERVALS_PER_HOUR } from './time';
import { R4haTracker } from './r4ha';

/**
 * Business windows end at these times of day (interval-of-day index). Work still
 * behind when a window closes costs SLA points.
 * 06:00 = overnight batch must be done; 18:00 = end of the online day.
 */
export const DEFAULT_SLA_WINDOW_ENDS = [6 * INTERVALS_PER_HOUR, 18 * INTERVALS_PER_HOUR];

/** Backlog below this (MSU) counts as caught up; avoids float dust failing an SLA. */
export const BACKLOG_EPSILON = 0.01;

export type CapReason = 'none' | 'definedCapacity' | 'groupCapacity' | 'physical';

export interface SlaMiss {
  lpar: LparId;
  /** Last interval of the window that closed with work behind. */
  interval: number;
  workBehind: number;
}

export interface CapResult {
  lparIds: LparId[];
  /** Demand that arrived each interval (input, for reference). */
  demand: number[][];
  /** MSU actually consumed each interval (after caps). */
  consumed: number[][];
  /** R4HA after each interval. */
  r4ha: number[][];
  /** Work behind (deferred MSU) after each interval. */
  workBehind: number[][];
  /** Why consumption was limited in each interval. */
  capReason: CapReason[][];
  slaMisses: SlaMiss[];
}

/**
 * Rules:
 * - Defined capacity: if an LPAR's R4HA is above its defined capacity, its consumption
 *   in the next interval is capped to the defined capacity.
 * - Group capacity: same, but when the sum of the group's R4HAs is above the group
 *   capacity, the group's combined consumption next interval is capped to it.
 *   (The game splits the group limit in proportion to each LPAR's pending work.)
 * - Demand above the cap is deferred to "work behind" and released when there is room
 *   (subject to the LPAR's physical capacity).
 *   Note: because the cap engages only after the R4HA crosses the DC, the R4HA can
 *   overshoot the DC for a few hours while the window still holds lower values.
 *   TODO(fact): does SCRT report min(R4HA, defined capacity) for a capped LPAR? If the
 *   facts file gains that, apply it in products.ts when reading R4HA for billing.
 * - Work still behind at the end of a business window is an SLA miss.
 */
export function simulateCapping(
  lpars: readonly Pick<Lpar, 'id' | 'capacityMsu'>[],
  demand: readonly (readonly number[])[],
  plan: CappingPlan,
  slaWindowEnds: readonly number[] = DEFAULT_SLA_WINDOW_ENDS,
): CapResult {
  const L = lpars.length;
  if (demand.length !== L) throw new Error('demand must have one series per LPAR');
  const n = L === 0 ? 0 : demand[0].length;
  const index = new Map(lpars.map((l, j) => [l.id, j]));

  const consumed = lpars.map(() => new Array<number>(n));
  const r4ha = lpars.map(() => new Array<number>(n));
  const workBehind = lpars.map(() => new Array<number>(n));
  const capReason = lpars.map(() => new Array<CapReason>(n));
  const trackers = lpars.map(() => new R4haTracker());
  const backlog = new Array<number>(L).fill(0);
  const prevR4ha = new Array<number>(L).fill(0);
  const slaMisses: SlaMiss[] = [];
  const windowEndSet = new Set(slaWindowEnds.map((e) => (e - 1 + INTERVALS_PER_DAY) % INTERVALS_PER_DAY));

  const groups = plan.groups.map((g) => ({
    cap: g.capacityMsu,
    members: g.lpars.map((id) => {
      const j = index.get(id);
      if (j === undefined) throw new Error(`Group ${g.name} names unknown LPAR ${id}`);
      return j;
    }),
  }));

  const available = new Array<number>(L);
  const take = new Array<number>(L);
  const reason = new Array<CapReason>(L);

  for (let i = 0; i < n; i++) {
    // Per-LPAR limits: physical capacity, then defined capacity if last R4HA was above it.
    for (let j = 0; j < L; j++) {
      available[j] = demand[j][i] + backlog[j];
      let limit = lpars[j].capacityMsu;
      reason[j] = 'none';
      const dc = plan.definedCapacity[lpars[j].id];
      if (dc !== undefined && prevR4ha[j] > dc && dc < limit) {
        limit = dc;
        reason[j] = 'definedCapacity';
      }
      take[j] = Math.min(available[j], limit);
      if (take[j] < available[j] && reason[j] === 'none') reason[j] = 'physical';
    }
    // Group capacity: applies to the sum of member R4HAs.
    for (const g of groups) {
      const groupR4ha = g.members.reduce((s, j) => s + prevR4ha[j], 0);
      if (groupR4ha <= g.cap) continue;
      const want = g.members.reduce((s, j) => s + take[j], 0);
      if (want <= g.cap) continue;
      const scale = g.cap / want;
      for (const j of g.members) {
        take[j] *= scale;
        reason[j] = 'groupCapacity';
      }
    }
    for (let j = 0; j < L; j++) {
      consumed[j][i] = take[j];
      backlog[j] = available[j] - take[j];
      if (backlog[j] < 1e-9) backlog[j] = 0;
      workBehind[j][i] = backlog[j];
      capReason[j][i] = reason[j];
      prevR4ha[j] = r4ha[j][i] = trackers[j].push(take[j]);
      if (windowEndSet.has(i % INTERVALS_PER_DAY) && backlog[j] > BACKLOG_EPSILON) {
        slaMisses.push({ lpar: lpars[j].id, interval: i, workBehind: backlog[j] });
      }
    }
  }

  return { lparIds: lpars.map((l) => l.id), demand: demand.map((d) => [...d]), consumed, r4ha, workBehind, capReason, slaMisses };
}

/** One SLA point per business window that closed with work behind. */
export function slaPointsLost(misses: readonly SlaMiss[]): number {
  return misses.length;
}
