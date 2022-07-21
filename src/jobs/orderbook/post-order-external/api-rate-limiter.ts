import { redis } from "@/common/redis";

export class OrderbookApiRateLimiter {
  private key = "orderbook-api-rate-limiter";
  private limit;
  private interval;

  public constructor(orderbook: string, orderbookApiKey: string, limit: number, interval: number) {
    this.key += `:${orderbook}:${orderbookApiKey}`;
    this.limit = limit;
    this.interval = interval;
  }

  public async reachedLimit() {
    // Always increment count
    const current = await redis.incr(this.key);

    if (current == 1) {
      await redis.pexpire(this.key, this.interval);
    }

    return current > this.limit;
  }

  public async getExpiration() {
    return await redis.pttl(this.key);
  }

  public async setExpiration(ttl: number) {
    return await redis.pexpire(this.key, ttl);
  }
}
