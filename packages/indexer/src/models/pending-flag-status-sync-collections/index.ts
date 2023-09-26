import _ from "lodash";
import { redis } from "@/common/redis";

export type PendingFlagStatusRefreshCollection = {
  slug: string;
  continuation: string;
};

/**
 * Class that manage redis list of tokens, pending metadata refresh
 */
export class PendingFlagStatusRefreshCollections {
  public static key = "pending-flag-status-sync-collections";

  public static async add(
    refreshCollection: PendingFlagStatusRefreshCollection[],
    prioritized = false
  ) {
    if (prioritized) {
      return await redis.lpush(
        this.key,
        _.map(refreshCollection, (token) => JSON.stringify(token))
      );
    } else {
      return await redis.rpush(
        this.key,
        _.map(refreshCollection, (token) => JSON.stringify(token))
      );
    }
  }

  public static async get(count = 20): Promise<PendingFlagStatusRefreshCollection[]> {
    const refreshCollections = await redis.lpop(this.key, count);
    if (refreshCollections) {
      return _.map(
        refreshCollections,
        (refreshCollection) => JSON.parse(refreshCollection) as PendingFlagStatusRefreshCollection
      );
    }

    return [];
  }

  public static async count(): Promise<number> {
    return await redis.llen(this.key);
  }
}
