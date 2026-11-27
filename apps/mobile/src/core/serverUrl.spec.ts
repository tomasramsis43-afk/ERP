import { normalizeServerUrl } from './serverUrl';

describe('normalizeServerUrl', () => {
  it('adds http:// and the API prefix to a bare LAN address', () => {
    expect(normalizeServerUrl('192.168.1.10:3001')).toBe('http://192.168.1.10:3001/api/v1');
  });
  it('keeps https and strips trailing slashes', () => {
    expect(normalizeServerUrl('https://erp.example.com/')).toBe('https://erp.example.com/api/v1');
  });
  it('keeps an explicit path', () => {
    expect(normalizeServerUrl('https://erp.example.com/api/v1/')).toBe('https://erp.example.com/api/v1');
  });
  it('rejects empty and malformed input', () => {
    expect(() => normalizeServerUrl('  ')).toThrow();
    expect(() => normalizeServerUrl('http://')).toThrow();
    expect(() => normalizeServerUrl('ht tp://x')).toThrow();
  });
  it('in a production build defaults to https and refuses plain http', () => {
    expect(normalizeServerUrl('erp.example.com', false)).toBe('https://erp.example.com/api/v1');
    expect(normalizeServerUrl('https://erp.example.com', false)).toBe('https://erp.example.com/api/v1');
    expect(() => normalizeServerUrl('http://192.168.1.10:3001', false)).toThrow('HTTPS is required');
  });
});
