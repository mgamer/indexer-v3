import { redis } from "@/common/redis";

/**
 * Class that manage redis list of tokens, pending metadata refresh
 */
export class PendingRefreshTokens {
  public key = "pending-refresh-tokens";

  public constructor(method: string) {
    this.key += `:${method}`;
  }

  public async add(token: string[], prioritized = false) {
    if (prioritized) {
      return await redis.lpush(this.key, token);
    } else {
      return await redis.rpush(this.key, token);
    }
  }

  public async get(count = 20) {
    return await redis.lpop(this.key, count);
  }
}
