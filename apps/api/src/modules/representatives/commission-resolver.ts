export type Basis = 'SALES' | 'COLLECTIONS' | 'MARGIN';

export interface RuleLike {
  id: string;
  representativeId: string | null;
  basis: Basis;
  ratePercent: string;
  productId: string | null;
  customerId: string | null;
  geoAreaId: string | null;
  createdAt: Date;
}

export interface CommissionContext {
  representativeId: string;
  productId?: string;
  customerId?: string | null;
  geoAreaId?: string | null;
}

/** A rule applies when every criterion it sets equals the transaction's value. */
function matches(rule: RuleLike, ctx: CommissionContext): boolean {
  if (rule.representativeId && rule.representativeId !== ctx.representativeId) return false;
  if (rule.productId && rule.productId !== ctx.productId) return false;
  if (rule.customerId && rule.customerId !== ctx.customerId) return false;
  if (rule.geoAreaId && rule.geoAreaId !== ctx.geoAreaId) return false;
  return true;
}

/** Specificity: representative (8) > product (4) > customer (2) > area (1). */
function score(rule: RuleLike): number {
  return (rule.representativeId ? 8 : 0) + (rule.productId ? 4 : 0) + (rule.customerId ? 2 : 0) + (rule.geoAreaId ? 1 : 0);
}

/**
 * Picks the single most specific rule among those with an allowed basis.
 * Ties go to the most recently created rule, so a newer rule overrides an older equal one.
 */
export function pickRule(rules: RuleLike[], ctx: CommissionContext, bases: Basis[]): RuleLike | undefined {
  let best: RuleLike | undefined;
  for (const r of rules) {
    if (!bases.includes(r.basis) || !matches(r, ctx)) continue;
    if (
      !best ||
      score(r) > score(best) ||
      (score(r) === score(best) && (r.createdAt > best.createdAt || (+r.createdAt === +best.createdAt && r.id > best.id)))
    ) {
      best = r;
    }
  }
  return best;
}
