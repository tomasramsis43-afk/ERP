import { whatsappNumber } from './phone';

describe('whatsappNumber', () => {
  it('adds the Egypt code to local numbers and keeps international ones', () => {
    expect(whatsappNumber('0100 123 4567')).toBe('201001234567');
    expect(whatsappNumber('+20 100 123 4567')).toBe('201001234567');
    expect(whatsappNumber('00966512345678')).toBe('966512345678');
  });
});
