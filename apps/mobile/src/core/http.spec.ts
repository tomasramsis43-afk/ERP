import { NetworkError, errorMessage, fetchWithTimeout, safeJson, singleFlight } from './http';

const ok = (body = '{}') => new Response(body, { status: 200 });

describe('fetchWithTimeout', () => {
  it('returns the response when the server answers in time', async () => {
    const res = await fetchWithTimeout(async () => ok(), 'http://x', {}, 1000);
    expect(res.status).toBe(200);
  });

  it('aborts and reports TIMEOUT when the server is too slow', async () => {
    const slow = (_u: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
    await expect(fetchWithTimeout(slow, 'http://x', {}, 20)).rejects.toMatchObject({ kind: 'TIMEOUT' });
  });

  it('reports OFFLINE when the network fails', async () => {
    const down = async () => {
      throw new TypeError('Network request failed');
    };
    await expect(fetchWithTimeout(down, 'http://x', {}, 1000)).rejects.toMatchObject({ kind: 'OFFLINE' });
  });

  it('reports CANCELLED when the caller aborts', async () => {
    const ctl = new AbortController();
    const hang = (_u: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
    const p = fetchWithTimeout(hang, 'http://x', {}, 5000, ctl.signal);
    ctl.abort();
    await expect(p).rejects.toBeInstanceOf(NetworkError);
    await expect(p).rejects.toMatchObject({ kind: 'CANCELLED' });
  });
});

describe('safeJson / errorMessage', () => {
  it('handles empty, valid and non-JSON bodies without throwing', () => {
    expect(safeJson('')).toEqual({ ok: true, value: null });
    expect(safeJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(safeJson('<html>502 Bad Gateway</html>')).toEqual({ ok: false });
  });

  it('joins validation message arrays and falls back otherwise', () => {
    expect(errorMessage({ message: ['a', 'b'] }, 'x')).toBe('a; b');
    expect(errorMessage({ statusCode: 400, error: { message: ['type must be one of MAIN'] } }, 'x')).toBe('type must be one of MAIN');
    expect(errorMessage({ statusCode: 400, error: { message: 'bad' } }, 'x')).toBe('bad');
    expect(errorMessage({ message: 'boom' }, 'x')).toBe('boom');
    expect(errorMessage(null, 'Bad Gateway')).toBe('Bad Gateway');
  });
});

describe('singleFlight', () => {
  it('shares one call between concurrent callers, then allows a new one', async () => {
    let calls = 0;
    const refresh = singleFlight(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return calls;
    });
    const [a, b, c] = await Promise.all([refresh(), refresh(), refresh()]);
    expect([a, b, c]).toEqual([1, 1, 1]);
    expect(await refresh()).toBe(2);
  });

  it('resets after a failure', async () => {
    let n = 0;
    const flaky = singleFlight(async () => {
      n += 1;
      if (n === 1) throw new Error('first fails');
      return n;
    });
    await expect(flaky()).rejects.toThrow('first fails');
    expect(await flaky()).toBe(2);
  });
});
