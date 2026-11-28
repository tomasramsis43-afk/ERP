const store = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => store.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void store.set(k, v),
  deleteItemAsync: async (k: string) => void store.delete(k),
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { apiUrl: 'https://api.test/api/v1' } } } }));

import { ApiError, NetworkError, SessionExpiredError, get, hasSession } from './client';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  store.clear();
  store.set('erp.access', 'old-access');
  store.set('erp.refresh', 'old-refresh');
});
afterEach(() => jest.restoreAllMocks());

describe('api client', () => {
  it('shares one refresh request between concurrent 401s', async () => {
    let refreshCalls = 0;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return json(200, { accessToken: 'new-access', refreshToken: 'new-refresh' });
      }
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === 'Bearer new-access' ? json(200, { ok: true }) : json(401, { message: 'expired' });
    });
    const results = await Promise.all([get('/a'), get('/b'), get('/c')]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
    expect(store.get('erp.refresh')).toBe('new-refresh');
  });

  it('reports an expired session and drops dead tokens when refresh is refused', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).endsWith('/auth/refresh') ? json(401, { message: 'bad' }) : json(401, { message: 'expired' }),
    );
    await expect(get('/a')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(await hasSession()).toBe(false);
  });

  it('keeps the session when refresh fails for a server reason (5xx)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).endsWith('/auth/refresh') ? json(503, { message: 'down' }) : json(401, { message: 'expired' }),
    );
    await expect(get('/a')).rejects.toBeInstanceOf(ApiError);
    expect(await hasSession()).toBe(true);
  });

  it('turns a non-JSON error page into an ApiError instead of a parse crash', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' }));
    await expect(get('/a')).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' });
  });

  it('classifies a failed connection as a NetworkError', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network request failed'));
    await expect(get('/a')).rejects.toBeInstanceOf(NetworkError);
  });
});
