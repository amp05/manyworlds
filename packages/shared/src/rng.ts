// djb2 hash
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // unsigned 32-bit
}

// mulberry32 PRNG — fast, good statistical properties, fully deterministic
function mulberry32(seed: number): () => number {
  let s = seed;
  return function () {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

export function dailySeed(date: Date): number {
  const dateStr = date.toISOString().slice(0, 10); // "2026-04-05"
  return hashString(dateStr);
}

export class SeededRNG {
  private _rng: () => number;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed;
    this._rng = mulberry32(seed);
  }

  /** Float in [0, 1) */
  next(): number {
    return this._rng();
  }

  /** Integer in [min, max] inclusive */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Pick a random element from an array */
  pick<T>(array: T[]): T {
    if (array.length === 0) throw new Error('Cannot pick from empty array');
    return array[Math.floor(this.next() * array.length)];
  }

  /** Shuffle array in place (Fisher-Yates) */
  shuffle<T>(array: T[]): T[] {
    const a = [...array];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Roll a probability check — returns true with `chance` probability [0,1] */
  roll(chance: number): boolean {
    return this.next() < chance;
  }

  /** Fork this RNG into a sub-RNG for a specific purpose.
   *  Forking by label means generation order of OTHER systems doesn't affect this one. */
  fork(label: string): SeededRNG {
    return new SeededRNG((this.seed ^ hashString(label)) >>> 0);
  }
}
