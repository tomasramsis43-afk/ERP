import { format, parseScaled } from './money';

/** Quantity text -> number of 1/10000 units, or null if it is not a usable positive number. */
const scaled = (q: string): bigint | null => {
  try {
    const v = parseScaled(q, 4);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
};

/**
 * One tap on + or −. Exact decimal arithmetic. Going to zero or below returns null, which the screen
 * treats as "remove the line". An unreadable text counts as 0, so + gives 1.
 */
export function stepQuantity(q: string, delta: 1 | -1): string | null {
  const cur = scaled(q) ?? 0n;
  const next = cur + BigInt(delta) * 10_000n;
  if (next <= 0n) return null;
  return trim(format(next, 4));
}

function trim(v: string): string {
  return v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v;
}
