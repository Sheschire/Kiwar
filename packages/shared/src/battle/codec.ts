import { EV_ARGS } from './types';

/**
 * Chantier 36: the journal's events as a compact string — each non-negative integer as a
 * base-64 varint (5 bits per character, the sixth says "more follows"). JSON-safe, about one
 * character per small number.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const INDEX = new Map([...ALPHABET].map((c, i) => [c, i]));

export function encodeInts(values: readonly number[]): string {
  let out = '';
  for (const raw of values) {
    let v = Math.max(0, Math.round(raw));
    while (v >= 32) {
      out += ALPHABET[32 + (v & 31)];
      v = Math.floor(v / 32);
    }
    out += ALPHABET[v];
  }
  return out;
}

export function decodeInts(text: string): number[] {
  const out: number[] = [];
  let v = 0;
  let mul = 1;
  for (const c of text) {
    const d = INDEX.get(c);
    if (d === undefined) throw new Error('bad battle log');
    if (d >= 32) {
      v += (d - 32) * mul;
      mul *= 32;
    } else {
      out.push(v + d * mul);
      v = 0;
      mul = 1;
    }
  }
  return out;
}

/** A decoded event: the time in seconds, its code and arguments. */
export interface LogEvent {
  t: number;
  code: number;
  args: number[];
}

/** Reads the events of a journal in order. */
export function decodeEvents(events: string, dt: number): LogEvent[] {
  const ints = decodeInts(events);
  const out: LogEvent[] = [];
  let step = 0;
  for (let i = 0; i < ints.length;) {
    const code = ints[i++]!;
    const n = EV_ARGS[code];
    if (n === undefined) throw new Error('bad battle log');
    const args = ints.slice(i, i + n);
    i += n;
    if (code === 0) step += args[0]!;
    else out.push({ t: step * dt, code, args });
  }
  return out;
}
