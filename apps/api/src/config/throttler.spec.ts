import { throttlerOptions } from './throttler';

describe('throttlerOptions', () => {
  const original = {
    REDIS_URL: process.env.REDIS_URL,
    THROTTLE_TTL: process.env.THROTTLE_TTL,
    THROTTLE_LIMIT: process.env.THROTTLE_LIMIT,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('uses shared in-memory storage by default', () => {
    delete process.env.REDIS_URL;
    delete process.env.THROTTLE_TTL;
    delete process.env.THROTTLE_LIMIT;
    const options = throttlerOptions() as { throttlers: { ttl: number; limit: number }[]; storage?: unknown };
    expect(options.throttlers).toEqual([{ ttl: 60_000, limit: 300 }]);
    expect(options.storage).toBeUndefined();
  });

  it('honours environment limits', () => {
    delete process.env.REDIS_URL;
    process.env.THROTTLE_TTL = '1000';
    process.env.THROTTLE_LIMIT = '12';
    const options = throttlerOptions() as { throttlers: { ttl: number; limit: number }[] };
    expect(options.throttlers).toEqual([{ ttl: 1000, limit: 12 }]);
  });
});
