import { db } from '../db.js';

export class RedisCacheService {
  public get<T>(key: string): T | null {
    const entry = db.redisCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      db.redisCache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  public set(key: string, value: any, ttlSeconds: number = 1800): void {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    db.redisCache.set(key, { value, expiresAt });
  }

  public delete(key: string): void {
    db.redisCache.delete(key);
  }

  /**
   * Sliding window rate limiter
   */
  public checkRateLimit(ipOrUserId: string, maxRequests: number = 100, windowSeconds: number = 60): { allowed: boolean; currentCount: number } {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const key = `ratelimit:${ipOrUserId}`;

    const tracker = db.rateLimitTracker.get(key);
    if (!tracker || now - tracker.windowStart > windowMs) {
      db.rateLimitTracker.set(key, { count: 1, windowStart: now });
      return { allowed: true, currentCount: 1 };
    }

    tracker.count += 1;
    if (tracker.count > maxRequests) {
      return { allowed: false, currentCount: tracker.count };
    }

    return { allowed: true, currentCount: tracker.count };
  }
}

export const redisCache = new RedisCacheService();
