import { acquireLock, redis } from "@/common/redis";
import _ from "lodash";
import { config } from "@/config/index";
import cron from "node-cron";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { AddressZero } from "@ethersproject/constants";

export class ZeroAddressBalance {
  public static key = `zero-address-balance`;

  public static async count(contract: string, tokenId: string, incrementBy = 1) {
    const member = `${contract}*${tokenId}`;
    await redis.zincrby(ZeroAddressBalance.key, incrementBy, member);
  }

  public static async popCounts(count = 200) {
    const results: { contract: string; tokenId: string; balance: number }[] = [];
    const counts = await redis.zpopmax(ZeroAddressBalance.key, count);

    for (let i = 0; i < counts.length; i += 2) {
      const [contract, tokenId] = _.split(counts[i], "*");
      results.push({
        contract,
        tokenId,
        balance: _.toInteger(counts[i + 1]),
      });
    }

    return results;
  }
}

if (config.doBackgroundWork) {
  cron.schedule("*/30 * * * * *", async () => {
    try {
      const lock = await acquireLock("record-zero-address-balance", 30 - 5);
      if (lock) {
        const count = 200;
        let balances = [];

        do {
          balances = await ZeroAddressBalance.popCounts(count);

          if (!_.isEmpty(balances)) {
            for (const balance of balances) {
              const query = `UPDATE nft_balances
                           SET amount = amount + $/balance/
                           WHERE contract = $/contract/
                           AND token_id = $/tokenId/
                           AND owner = $/owner/`;

              await idb.none(query, {
                balance: balance.balance,
                contract: toBuffer(balance.contract),
                tokenId: balance.tokenId,
                owner: toBuffer(AddressZero),
              });
            }
          }
        } while (balances.length === count);
      }
    } catch (error) {
      logger.error(
        "record-zero-address-balance",
        `failed to record zero adderss balance error ${error}`
      );
    }
  });
}
