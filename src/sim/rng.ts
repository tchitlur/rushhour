/** Small, fast, seedable PRNG (mulberry32) with helpers. */
export class RNG {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 1; }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** normal via Box–Muller */
  normal(mean = 0, sd = 1): number {
    const u = Math.max(this.next(), 1e-12), v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /** lognormal-ish positive noise around mean with given sd */
  posNoise(mean: number, sd: number): number {
    return Math.max(mean * 0.4, this.normal(mean, sd));
  }
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 30) return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= this.next(); } while (p > L);
    return k - 1;
  }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  weighted<T>(arr: T[], w: (x: T) => number): T {
    let total = 0; for (const x of arr) total += w(x);
    let r = this.next() * total;
    for (const x of arr) { r -= w(x); if (r <= 0) return x; }
    return arr[arr.length - 1];
  }
}

export function hashSeed(...parts: number[]): number {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    h ^= (p >>> 0); h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  }
  return h >>> 0;
}
