/** Hosts where plain http:// is acceptable: this phone, an emulator's host alias, and private LAN ranges. */
export function isLocalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '10.0.2.2' || h.endsWith('.local')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/**
 * Turns what a person types ("192.168.1.10:3001", "erp.example.com") into the API base URL.
 * Traffic that leaves the local network must be encrypted: a bare public host gets https://, and an explicit
 * http:// to a public host is refused. Plain http:// stays possible only for a LAN or emulator server.
 */
export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!url) throw new Error('Server address is empty');
  const hasScheme = /^https?:\/\//i.test(url);
  if (!hasScheme) url = `placeholder://${url}`;
  const m = /^(?:(https?|placeholder):\/\/)([^/\s?#]+)(\/[^\s?#]*)?$/i.exec(url);
  if (!m) throw new Error('Invalid server address');
  const host = m[2].replace(/:\d+$/, '');
  const local = isLocalHost(host);
  let scheme = m[1].toLowerCase();
  if (scheme === 'placeholder') scheme = local ? 'http' : 'https';
  if (scheme === 'http' && !local) throw new Error('A public server must use https://');
  const path = (m[3] ?? '').replace(/\/+$/, '');
  return `${scheme}://${m[2]}${path === '' ? '/api/v1' : path}`;
}
