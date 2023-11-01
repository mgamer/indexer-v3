import _ from "lodash";
import { redis } from "@/common/redis";

export type PendingFetchOnchainUriToken = {
  contract: string;
  tokenId: string;
};

/**
 * Class that manage redis list of tokens, pending metadata refresh
 */
export class PendingFetchOnchainUriTokens {
  public static key = "pending-fetch-onchain-uri-tokens";

  public static async add(refreshToken: PendingFetchOnchainUriToken[], prioritized = false) {
    if (prioritized) {
      return await redis.lpush(
        this.key,
        _.map(refreshToken, (token) => JSON.stringify(token))
      );
    } else {
      return await redis.rpush(
        this.key,
        _.map(refreshToken, (token) => JSON.stringify(token))
      );
    }
  }

  public static async get(count = 20): Promise<PendingFetchOnchainUriToken[]> {
    const refreshTokens = await redis.lpop(this.key, count);
    if (refreshTokens) {
      return _.map(
        refreshTokens,
        (refreshToken) => JSON.parse(refreshToken) as PendingFetchOnchainUriToken
      );
    }

    return [];
  }

  public static async len(): Promise<number> {
    return await redis.llen(this.key);
  }
}
