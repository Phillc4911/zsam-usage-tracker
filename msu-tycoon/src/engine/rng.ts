/**
 * Seeded RNG (mulberry32). The seed is shown in settings so a run is reproducible.
 */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive an independent seed for a sub-stream (e.g. one LPAR in one month). */
export function deriveSeed(seed: number, ...parts: number[]): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const p of parts) {
    h = Math.imul(h ^ (p >>> 0), 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return h;
}

/** Roughly normal noise in [-1, 1] (mean of 3 uniforms, rescaled). */
export function noise(rng: Rng): number {
  return ((rng() + rng() + rng()) / 3) * 2 - 1;
}

export function stringSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
