import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ThrottlerModuleOptions, ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import Redis from 'ioredis';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/** Uses Redis when available, but keeps serving requests from local memory during an outage. */
class ResilientRedisThrottlerStorage implements ThrottlerStorage {
  private readonly fallback = new ThrottlerStorageService();

  constructor(private readonly redis: ThrottlerStorageRedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      return await this.redis.increment(key, ttl, limit, blockDuration, throttlerName);
    } catch {
      return this.fallback.increment(`fallback:${key}`, ttl, limit, blockDuration, throttlerName);
    }
  }
}

/**
 * Rate-limit storage: in-memory by default, shared Redis when REDIS_URL is set.
 * Env overrides allow tuning without a code deploy; invalid values fall back to defaults.
 */
export function throttlerOptions(): ThrottlerModuleOptions {
  const ttl = Number(process.env.THROTTLE_TTL) || 60_000;
  const limit = Number(process.env.THROTTLE_LIMIT) || 300;
  const throttlers = [{ ttl, limit }];
  const url = process.env.REDIS_URL?.trim();
  if (!url) return { throttlers };

  const redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  // A Redis outage must not crash the process; storage falls back to local memory.
  redis.on('error', () => undefined);
  return { throttlers, storage: new ResilientRedisThrottlerStorage(new ThrottlerStorageRedisService(redis)) };
}
