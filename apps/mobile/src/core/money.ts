/**
 * Exact decimal arithmetic with BigInt. Amounts are parsed from the server's decimal strings and never
 * pass through floating point, so a total shown on the phone matches what the server will compute.
 */
export type Scaled = bigint;

export function parseScaled(value: string, scale: number): Scaled {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) throw new Error(`Invalid number: ${value}`);
  const frac = (m[3] ?? '').padEnd(scale, '0').slice(0, scale);
  const raw = BigInt(m[2] + frac);
  return m[1] === '-' ? -raw : raw;
}

export function format(value: Scaled, scale: number): string {
  const neg = value < 0n;
  const abs = (neg ? -value : value).toString().padStart(scale + 1, '0');
  const int = abs.slice(0, abs.length - scale);
  const frac = abs.slice(abs.length - scale);
  return `${neg ? '-' : ''}${int}${scale ? '.' + frac : ''}`;
}

/** qty (4 decimals) × price (4 decimals) → money (2 decimals), rounded half up like the server. */
export function lineAmount(qty: Scaled, price: Scaled): Scaled {
  const product = qty * price; // 8 decimals
  const divisor = 1_000_000n; // → 2 decimals
  const q = product / divisor;
  const r = product % divisor;
  return r * 2n >= divisor ? q + 1n : q;
}
