export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Bell curve: 1 at `mean`, falling off with standard deviation `sd`. */
export const gauss = (x: number, mean: number, sd: number): number => Math.exp(-0.5 * ((x - mean) / sd) ** 2);

/**
 * Deterministic pseudo-random generator (mulberry32) seeded by a string.
 * Same seed → same sequence, so generated map points don't jump around on every redraw.
 */
export function seededRandom(seed: string): () => number {
  let a = 0;
  for (const c of seed) a = (a * 31 + c.charCodeAt(0)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
