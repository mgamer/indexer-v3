import { redis } from "@/common/redis";

export type SyncFlagStatusJobInfo =
  | {
      kind: "collection";
      data: {
        collectionId: string;
        backfill: boolean;
      };
    }
  | {
      kind: "token";
      data: {
        collectionId: string;
        contract: string;
        tokenId: string;
        tokenIsFlagged: number;
      };
    };

/**
 * Class that manage redis list of tokens, pending flag status sync
 */
export class PendingFlagStatusSyncJobs {
  public key = "pending-flag-status-sync-jobs";

  public async add(job: SyncFlagStatusJobInfo) {
    return await redis.zadd(this.key, "NX", Date.now(), JSON.stringify(job));
  }

  public async next(): Promise<SyncFlagStatusJobInfo | null> {
    const result = await redis.zpopmin(this.key);
    return result.length ? JSON.parse(result[0]) : null;
  }
}
