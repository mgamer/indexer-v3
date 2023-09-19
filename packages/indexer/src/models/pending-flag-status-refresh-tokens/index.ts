import _ from "lodash";
import { redis } from "@/common/redis";

export type PendingFlagStatusRefreshToken = {
  collectionId: string;
  contract: string;
  tokenId: string;
  isFlagged: number;
};

/**
 * Class that manage redis list of tokens, pending flag status sync
 */
export class PendingFlagStatusRefreshTokens {
  public key = "pending-flag-status-refresh-tokens";

  public constructor(collectionId: string) {
    this.key += `:${collectionId}`;
  }

  public async add(tokens: PendingFlagStatusRefreshToken[], prioritized = false) {
    if (prioritized) {
      return await redis.lpush(
        this.key,
        _.map(tokens, (token) => JSON.stringify(token))
      );
    } else {
      return await redis.rpush(
        this.key,
        _.map(tokens, (token) => JSON.stringify(token))
      );
    }
  }

  public async get(count = 1): Promise<PendingFlagStatusRefreshToken[]> {
    const tokens = await redis.lpop(this.key, count);
    if (tokens) {
      return _.map(tokens, (token) => JSON.parse(token) as PendingFlagStatusRefreshToken);
    }

    return [];
  }

  public async count(): Promise<number> {
    return await redis.llen(this.key);
  }
}
