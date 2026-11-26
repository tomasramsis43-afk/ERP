/**
 * Turns what a person types ("192.168.1.10:3001", "https://erp.example.com/") into the API base URL.
 * A bare host gets http:// (a LAN server); the API prefix is added when missing.
 */
export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!url) throw new Error('Server address is empty');
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  const m = /^(https?:\/\/[^/\s?#]+)(\/[^\s?#]*)?$/i.exec(url);
  if (!m) throw new Error('Invalid server address');
  const path = (m[2] ?? '').replace(/\/+$/, '');
  return `${m[1]}${path === '' ? '/api/v1' : path}`;
}
