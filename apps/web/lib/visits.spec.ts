import { visitOutcomeLabel, visitOutcomeTone } from './visits';

const en = (ar: string, english: string) => english;
const ar = (arabic: string, _en: string) => arabic;

describe('visit presentation helpers', () => {
  it('labels every backend outcome in both languages', () => {
    expect(visitOutcomeLabel('SALE', en)).toBe('Sale');
    expect(visitOutcomeLabel('COLLECTION', en)).toBe('Collection');
    expect(visitOutcomeLabel('NO_ORDER', en)).toBe('No order');
    expect(visitOutcomeLabel('SHOP_CLOSED', ar)).toBe('مغلق');
    expect(visitOutcomeLabel('NOT_REACHED', ar)).toBe('لم يتم الوصول');
  });

  it('passes unknown outcomes through unchanged', () => {
    expect(visitOutcomeLabel('FUTURE_OUTCOME', en)).toBe('FUTURE_OUTCOME');
  });

  it('tones successful, financial and failed visits differently', () => {
    expect(visitOutcomeTone('SALE')).toBe('ok');
    expect(visitOutcomeTone('COLLECTION')).toBe('info');
    expect(visitOutcomeTone('NOT_REACHED')).toBe('danger');
    expect(visitOutcomeTone('NO_ORDER')).toBe('muted');
  });
});
