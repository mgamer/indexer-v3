import _ from "lodash";
import { redis } from "@/common/redis";

export type RefreshTokenBySlug = {
  slug: string;
  contract: string;
  continuation?: string;
};

/**
 * Class that manage redis list of tokens metadata refresh by slug
 */
export class PendingRefreshTokensBySlug {
  public key = "pending-refresh-tokens-by-slug";

  public constructor(method: string) {
    this.key += `:${method}`;
  }

  public async add(refreshTokenBySlug: RefreshTokenBySlug, prioritized = false) {
    return prioritized
      ? await redis.lpush(this.key, JSON.stringify(refreshTokenBySlug))
      : await redis.rpush(this.key, JSON.stringify(refreshTokenBySlug));
  }

  public async get(count = 20): Promise<RefreshTokenBySlug[]> {
    const refreshTokensBySlug = await redis.lpop(this.key, count);
    if (refreshTokensBySlug) {
      return _.map(
        refreshTokensBySlug,
        (refreshTokenBySlug) => JSON.parse(refreshTokenBySlug) as RefreshTokenBySlug
      );
    }

    return [];
  }
}
