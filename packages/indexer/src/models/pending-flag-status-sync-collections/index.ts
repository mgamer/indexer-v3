import _ from "lodash";
import { redis } from "@/common/redis";

export type RefreshCollection = {
  slug: string;
  continuation: string;
};

/**
 * Class that manage redis list of tokens, pending metadata refresh
 */
export class PendingRefreshCollections {
  public static key = "pending-flag-status-sync-collections";

  public static async add(refreshCollection: RefreshCollection[], prioritized = false) {
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

  public static async get(count = 20): Promise<RefreshCollection[]> {
    const refreshCollections = await redis.lpop(this.key, count);
    if (refreshCollections) {
      return _.map(
        refreshCollections,
        (refreshCollection) => JSON.parse(refreshCollection) as RefreshCollection
      );
    }

    return [];
  }

  public static async count(): Promise<number> {
    return await redis.llen(this.key);
  }
}
