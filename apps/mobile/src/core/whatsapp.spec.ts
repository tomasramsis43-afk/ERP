import { telUrl, whatsappNumber, whatsappUrl } from './whatsapp';

describe('whatsapp and phone links', () => {
  it('converts Egyptian local, international and 00-prefixed numbers', () => {
    expect(whatsappNumber('0100 123 4567')).toBe('201001234567');
    expect(whatsappNumber('+20 100 123 4567')).toBe('201001234567');
    expect(whatsappNumber('00201001234567')).toBe('201001234567');
    expect(whatsappNumber('966 50 123 4567')).toBe('966501234567');
  });
  it('rejects empty and implausible numbers', () => {
    expect(whatsappNumber(null)).toBeNull();
    expect(whatsappNumber('')).toBeNull();
    expect(whatsappNumber('123')).toBeNull();
  });
  it('builds a wa.me link with the text encoded, with or without a number', () => {
    expect(whatsappUrl('01001234567', 'a b\nc')).toBe('https://wa.me/201001234567?text=a%20b%0Ac');
    expect(whatsappUrl(null, 'x')).toBe('https://wa.me/?text=x');
  });
  it('builds a tel link', () => {
    expect(telUrl('+20 100-123 4567')).toBe('tel:+201001234567');
    expect(telUrl('')).toBeNull();
  });
});
