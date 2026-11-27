/** Delay before retry number `attempt` (1-based): 5s, 10s, 20s ... capped at 5 minutes, with up to 20% jitter. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(5_000 * 2 ** Math.max(0, attempt - 1), 300_000);
  return Math.round(base * (1 + 0.2 * random()));
}
