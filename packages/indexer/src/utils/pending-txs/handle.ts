import { redis } from "@/common/redis";
import { extractOrdersFromCalldata } from "@/events-sync/handlers/royalties/calldata";
import * as es from "@/events-sync/storage";
import { PendingMessage, PendingToken, TxLog } from "@/utils/pending-txs/types";

const RECENT_LIMIT = 2;

export const handlePendingMessage = async (message: PendingMessage) => {
  try {
    const { txContents, txHash } = message;

    // Parse pending tokens from the calldata of pending transactions
    const parsedOrders = await extractOrdersFromCalldata(txContents.input);
    const pendingTokens = parsedOrders
      .map((c) => {
        return {
          contract: c.contract,
          tokenId: c.tokenId,
        };
      })
      .filter((c) => c.tokenId) as PendingToken[];

    if (pendingTokens.length) {
      await addPendingTokens(pendingTokens, txHash);
    }

    return pendingTokens;
  } catch {
    // Skip errors
  }
};

export const addPendingTokens = async (tokens: PendingToken[], txHash: string) => {
  const pipe = redis.multi();
  const recentPendingTxKey = `pending-tokens:recent`;

  for (const { contract, tokenId } of tokens) {
    pipe.lpush(recentPendingTxKey, `${contract}:${tokenId}:${txHash}:${Date.now()}`);
    const contractDoneTxsKey = `pending-tokens:${contract}:recent`;
    pipe.lpush(contractDoneTxsKey, `${contract}:${tokenId}:${txHash}:${Date.now()}`);
    pipe.expire(contractDoneTxsKey, 10 * 60);
  }

  // Link the transaction to its corresponding pending tokens
  pipe.set(`pending-tx:${txHash}`, JSON.stringify(tokens), "EX", 5 * 60);
  pipe.ltrim(recentPendingTxKey, 0, RECENT_LIMIT);
  for (const { contract } of tokens) {
    pipe.ltrim(`pending-tokens:${contract}:recent`, 0, RECENT_LIMIT);
  }
  await pipe.exec();
};

export const setPendingTxsAsComplete = async (txHashes: string[]) => {
  try {
    const pendingTokensKeys = txHashes.map((txHash) => `pending-tx:${txHash}`);
    const allPendingTokens = await redis
      .mget(pendingTokensKeys)
      .then((c) => c.map((d) => (d ? (JSON.parse(d) as PendingToken[]) : [])));
    if (allPendingTokens.every((c) => !c.length)) {
      return;
    }

    const pipe = redis.multi();
    for (let i = 0; i < allPendingTokens.length; i++) {
      const pendingTokens = allPendingTokens[i];

      const txHash = txHashes[i];
      if (pendingTokens.length) {
        for (const { contract, tokenId } of pendingTokens) {
          const contractDoneTxsKey = `pending-tokens:${contract}:done`;
          pipe.lpush(contractDoneTxsKey, `${contract}:${tokenId}:${txHash}:${Date.now()}`);
          pipe.lpush(
            `pending-tokens:recent:done`,
            `${contract}:${tokenId}:${txHash}:${Date.now()}`
          );
          pipe.expire(contractDoneTxsKey, 10 * 60);
        }
        pipe.del(`pending-tx:${txHash}`);
      }
    }

    await pipe.exec();
  } catch {
    // Skip errors
  }
};

export const onFillEventsCallback = async (fillEvents: es.fills.Event[]) => {
  try {
    const txHashes = Array.from(new Set(fillEvents.map((c) => c.baseEventParams.txHash)));
    await setPendingTxsAsComplete(txHashes);
  } catch {
    // Skip errors
  }
};

function convertToTxLog(items: string[]): TxLog[] {
  return items.map((item: string) => {
    const [contract, tokenId, txHash, seen] = item.split(":");
    return {
      contract,
      tokenId,
      txHash,
      seen,
    };
  });
}

async function getPendingTxs(pendingKey: string, doneKey: string) {
  const pipe = redis.multi();

  pipe.lrange(pendingKey, 0, RECENT_LIMIT);
  pipe.lrange(doneKey, 0, RECENT_LIMIT);

  const rawResults = await pipe.exec();
  const [pendingTxs, doneTxs] = rawResults;

  if (pendingTxs[0]) return [];

  const pendingTxLogs = convertToTxLog(pendingTxs[1]);
  const doneTxLogs = convertToTxLog(doneTxs[1]);

  const finishedTokenIds = new Set();
  const finishedTxs = new Set();

  for (const doneTxLog of doneTxLogs) {
    finishedTokenIds.add(doneTxLog.tokenId);
    finishedTxs.add(doneTxLog.txHash);
  }

  return pendingTxLogs.filter((c) => {
    const txIsDone = finishedTxs.has(c.txHash);
    const tokenFilled = finishedTokenIds.has(c.tokenId);
    const isExpired = Date.now() - parseInt(c.seen) > 120 * 1000;
    if (txIsDone || tokenFilled || isExpired) {
      return false;
    }
    return true;
  });
}

export const getContractPendingTokenIds = async (contract: string) => {
  const contractPendingTxsKey = `pending-tokens:${contract}:recent`;
  const contractDoneTxsKey = `pending-tokens:${contract}:done`;
  return getPendingTxs(contractPendingTxsKey, contractDoneTxsKey);
};

export const getRecentPendingTokens = async () => {
  return getPendingTxs("pending-tokens:recent", "pending-tokens:recent:done");
};
