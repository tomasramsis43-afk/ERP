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
  it('defaults a bare public host to https', () => {
    expect(normalizeServerUrl('erp-api.onrender.com')).toBe('https://erp-api.onrender.com/api/v1');
  });
  it('refuses plain http to a public host but allows emulator and private ranges', () => {
    expect(() => normalizeServerUrl('http://erp.example.com')).toThrow('https');
    expect(normalizeServerUrl('http://10.0.2.2:3001')).toBe('http://10.0.2.2:3001/api/v1');
    expect(normalizeServerUrl('172.20.1.5')).toBe('http://172.20.1.5/api/v1');
    expect(() => normalizeServerUrl('http://172.40.1.5')).toThrow();
  });
  it('rejects empty and malformed input', () => {
    expect(() => normalizeServerUrl('  ')).toThrow();
    expect(() => normalizeServerUrl('http://')).toThrow();
    expect(() => normalizeServerUrl('ht tp://x')).toThrow();
  });
});
