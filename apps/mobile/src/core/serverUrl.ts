/**
 * Turns what a person types ("192.168.1.10:3001", "https://erp.example.com/") into the API base URL.
 * With `allowHttp` (development and preview builds) a bare host gets http:// so a LAN server works.
 * Without it (production builds) a bare host gets https:// and an explicit http:// address is refused.
 * The API prefix is added when missing.
 */
export function normalizeServerUrl(input: string, allowHttp = true): string {
  let url = input.trim();
  if (!url) throw new Error('Server address is empty');
  if (!/^https?:\/\//i.test(url)) url = `${allowHttp ? 'http' : 'https'}://${url}`;
  const m = /^(https?:\/\/[^/\s?#]+)(\/[^\s?#]*)?$/i.exec(url);
  if (!m) throw new Error('Invalid server address');
  if (!allowHttp && /^http:\/\//i.test(m[1])) throw new Error('HTTPS is required in this build');
  const path = (m[2] ?? '').replace(/\/+$/, '');
  return `${m[1]}${path === '' ? '/api/v1' : path}`;
}
