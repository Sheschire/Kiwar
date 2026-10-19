/** Helpers to express progression curves in data files. */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export const ms = {
  s: (n: number) => Math.round(n * SECOND),
  min: (n: number) => Math.round(n * MINUTE),
  h: (n: number) => Math.round(n * HOUR),
};

/** `base * growth^n`, rounded to the nearest `step`. */
export function geometric(base: number, growth: number, n: number, step = 1): number {
  return Math.round((base * growth ** n) / step) * step;
}
