export type VisitOutcome = 'SALE' | 'COLLECTION' | 'NO_ORDER' | 'SHOP_CLOSED' | 'NOT_REACHED';

export interface RouteCustomer {
  id: string;
  code: string;
  routeSequence?: number | null;
}

/** The visiting order: planned stops first (by sequence), the rest by code. */
export function visitOrder<T extends RouteCustomer>(customers: T[]): T[] {
  return [...customers].sort((a, b) => {
    const sa = a.routeSequence ?? Number.MAX_SAFE_INTEGER;
    const sb = b.routeSequence ?? Number.MAX_SAFE_INTEGER;
    return sa !== sb ? sa - sb : a.code.localeCompare(b.code);
  });
}

/** How many of today's customers have been visited. */
export function routeProgress(customers: RouteCustomer[], visited: Map<string, VisitOutcome>): { done: number; total: number } {
  return { done: customers.filter((c) => visited.has(c.id)).length, total: customers.length };
}

/**
 * A sale or a collection to a customer counts as a visit when no visit was logged yet today, so the representative does
 * not have to log the visit again after serving the customer. A manual outcome is never overwritten.
 */
export function impliedVisit(existing: VisitOutcome | undefined, op: 'SALE' | 'COLLECTION'): VisitOutcome | null {
  return existing ? null : op;
}
