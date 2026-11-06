import { describe, expect, it } from 'vitest';
import { simulateCapping, slaPointsLost } from '../capping';
import type { CappingPlan } from '../types';

const BIG = 1000;

describe('defined capacity (soft cap)', () => {
  // One LPAR, DC = 50, demand 60 for 48 intervals then 0.
  const demand = [[...Array(48).fill(60), 0, 0, 0]];
  const plan: CappingPlan = { definedCapacity: { A: 50 }, groups: [] };
  const r = simulateCapping([{ id: 'A', capacityMsu: BIG }], demand, plan, []);

  it('does not cap the first interval (no R4HA above DC yet)', () => {
    expect(r.consumed[0][0]).toBe(60);
    expect(r.r4ha[0][0]).toBe(60);
    expect(r.capReason[0][0]).toBe('none');
  });

  it('caps the next interval to DC once R4HA is above it, deferring the rest', () => {
    // i=1: prev R4HA 60 > 50 -> consume 50, 10 behind, R4HA (60+50)/2 = 55
    expect(r.consumed[0][1]).toBe(50);
    expect(r.workBehind[0][1]).toBe(10);
    expect(r.r4ha[0][1]).toBe(55);
    expect(r.capReason[0][1]).toBe('definedCapacity');
    // i=2: available 60+10 = 70, consume 50, 20 behind
    expect(r.workBehind[0][2]).toBe(20);
  });

  it('keeps capping while the early 60 is still in the window', () => {
    // i=1..47 each defer 10 -> 470 behind; R4HA[47] = (60 + 47x50)/48
    expect(r.workBehind[0][47]).toBeCloseTo(470, 9);
    expect(r.r4ha[0][47]).toBeCloseTo(2410 / 48, 9);
    // i=48: prev R4HA 50.208 > 50 -> still capped, consume 50 from the backlog
    expect(r.consumed[0][48]).toBe(50);
    expect(r.workBehind[0][48]).toBeCloseTo(420, 9);
    expect(r.r4ha[0][48]).toBeCloseTo(50, 9);
  });

  it('releases work behind when R4HA is no longer above DC', () => {
    // i=49: prev R4HA = 50, not above 50 -> uncapped, all 420 released
    expect(r.capReason[0][49]).toBe('none');
    expect(r.consumed[0][49]).toBeCloseTo(420, 9);
    expect(r.workBehind[0][49]).toBe(0);
  });

  it('defers work but does not lose it', () => {
    const totalDemand = demand[0].reduce((a, b) => a + b, 0);
    const totalConsumed = r.consumed[0].reduce((a, b) => a + b, 0);
    expect(totalConsumed).toBeCloseTo(totalDemand, 9); // 2880
  });
});

describe('physical capacity', () => {
  it('limits an uncapped LPAR to its capacity and carries the rest', () => {
    const r = simulateCapping([{ id: 'A', capacityMsu: 30 }], [[50, 0, 0]], { definedCapacity: {}, groups: [] }, []);
    expect(r.consumed[0]).toEqual([30, 20, 0]);
    expect(r.capReason[0][0]).toBe('physical');
  });
});

describe('SLA', () => {
  it('records a miss when a business window closes with work behind', () => {
    // Window ending at interval-of-day 48 is checked after interval 47 (470 behind).
    const demand = [[...Array(48).fill(60), 0, 0]];
    const r = simulateCapping([{ id: 'A', capacityMsu: BIG }], demand, { definedCapacity: { A: 50 }, groups: [] }, [48]);
    expect(r.slaMisses).toHaveLength(1);
    expect(r.slaMisses[0].interval).toBe(47);
    expect(r.slaMisses[0].workBehind).toBeCloseTo(470, 9);
    expect(slaPointsLost(r.slaMisses)).toBe(1);
  });
  it('no miss if the backlog cleared before the window closed', () => {
    const demand = [[...Array(48).fill(60), 0, 0]];
    const r = simulateCapping([{ id: 'A', capacityMsu: BIG }], demand, { definedCapacity: { A: 50 }, groups: [] }, [50]);
    expect(r.slaMisses).toHaveLength(0);
  });
});

describe('group capacity', () => {
  // A demands 80, B demands 40, group cap 100, no individual DCs.
  const demand = [Array(3).fill(80), Array(3).fill(40)];
  const plan: CappingPlan = { definedCapacity: {}, groups: [{ name: 'G', lpars: ['A', 'B'], capacityMsu: 100 }] };
  const r = simulateCapping([{ id: 'A', capacityMsu: BIG }, { id: 'B', capacityMsu: BIG }], demand, plan, []);

  it('does not cap until the summed R4HA is above the group capacity', () => {
    expect(r.consumed[0][0]).toBe(80);
    expect(r.consumed[1][0]).toBe(40);
  });

  it('caps the group total to the group capacity', () => {
    // i=1: prev sum R4HA = 120 > 100 -> 120 scaled to 100 (A 66.67, B 33.33)
    expect(r.consumed[0][1] + r.consumed[1][1]).toBeCloseTo(100, 9);
    expect(r.consumed[0][1]).toBeCloseTo(200 / 3, 9);
    expect(r.workBehind[0][1]).toBeCloseTo(40 / 3, 9);
    expect(r.capReason[1][1]).toBe('groupCapacity');
    // i=1 R4HA: A (80+66.67)/2 = 73.33, B 36.67 -> 110, still above, so i=2 capped too
    expect(r.r4ha[0][1] + r.r4ha[1][1]).toBeCloseTo(110, 9);
    expect(r.consumed[0][2] + r.consumed[1][2]).toBeCloseTo(100, 9);
  });

  it('leaves a group alone when it is under its capacity', () => {
    const r2 = simulateCapping(
      [{ id: 'A', capacityMsu: BIG }, { id: 'B', capacityMsu: BIG }],
      demand,
      { definedCapacity: {}, groups: [{ name: 'G', lpars: ['A', 'B'], capacityMsu: 200 }] },
      [],
    );
    expect(r2.consumed[0]).toEqual([80, 80, 80]);
  });

  it('applies the lower of an LPAR defined capacity and the group capacity', () => {
    const r3 = simulateCapping(
      [{ id: 'A', capacityMsu: BIG }, { id: 'B', capacityMsu: BIG }],
      demand,
      { definedCapacity: { A: 50 }, groups: [{ name: 'G', lpars: ['A', 'B'], capacityMsu: 100 }] },
      [],
    );
    // i=1: A capped by DC to 50; A+B = 90 <= 100, so group cap doesn't bite
    expect(r3.consumed[0][1]).toBe(50);
    expect(r3.consumed[1][1]).toBe(40);
    expect(r3.capReason[0][1]).toBe('definedCapacity');
  });
});
