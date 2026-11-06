import { describe, expect, it } from 'vitest';
import { R4haTracker, rollingFourHourAverage } from '../r4ha';
import { R4HA_WINDOW, INTERVALS_PER_DAY, intervalsInMonth } from '../time';

describe('time constants', () => {
  it('has 288 five-minute intervals per day and a 48-interval R4HA window', () => {
    expect(INTERVALS_PER_DAY).toBe(288);
    expect(R4HA_WINDOW).toBe(48);
  });
  it('accepts 28-31 day months only', () => {
    expect(intervalsInMonth(28)).toBe(8064);
    expect(intervalsInMonth(31)).toBe(8928);
    expect(() => intervalsInMonth(27)).toThrow();
    expect(() => intervalsInMonth(32)).toThrow();
  });
});

describe('R4HA', () => {
  it('uses the intervals available before 48 exist', () => {
    // [12] -> 12; [12,0] -> 6; [12,0,6] -> 6
    expect(rollingFourHourAverage([12, 0, 6])).toEqual([12, 6, 6]);
  });

  it('is the mean of the last 48 intervals once 48 exist', () => {
    // 48 intervals at 10 MSU, then 48 at 20 MSU.
    const consumed = [...Array(48).fill(10), ...Array(48).fill(20)];
    const r = rollingFourHourAverage(consumed);
    expect(r[47]).toBe(10);
    // i=48: window is 1..48 = 47x10 + 1x20 = 490 / 48
    expect(r[48]).toBeCloseTo(490 / 48, 10);
    // i=60: window is 13..60 = 35x10 + 13x20 = 610 / 48
    expect(r[60]).toBeCloseTo(610 / 48, 10);
    expect(r[95]).toBe(20);
  });

  it('incremental tracker matches the batch function', () => {
    const consumed = Array.from({ length: 300 }, (_, i) => (i * 37) % 101);
    const t = new R4haTracker();
    const inc = consumed.map((c) => t.push(c));
    const batch = rollingFourHourAverage(consumed);
    inc.forEach((v, i) => expect(v).toBeCloseTo(batch[i], 9));
  });
});
