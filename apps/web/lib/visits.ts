export type VisitOutcome = 'SALE' | 'COLLECTION' | 'NO_ORDER' | 'SHOP_CLOSED' | 'NOT_REACHED';
export type VisitTone = 'ok' | 'info' | 'danger' | 'muted';

export function visitOutcomeLabel(outcome: VisitOutcome | string, tr: (ar: string, en: string) => string): string {
  switch (outcome) {
    case 'SALE': return tr('بيع', 'Sale');
    case 'COLLECTION': return tr('تحصيل', 'Collection');
    case 'NO_ORDER': return tr('بدون طلب', 'No order');
    case 'SHOP_CLOSED': return tr('مغلق', 'Shop closed');
    case 'NOT_REACHED': return tr('لم يتم الوصول', 'Not reached');
    default: return outcome;
  }
}

export function visitOutcomeTone(outcome: VisitOutcome | string): VisitTone {
  if (outcome === 'SALE') return 'ok';
  if (outcome === 'COLLECTION') return 'info';
  if (outcome === 'NOT_REACHED') return 'danger';
  return 'muted';
}
