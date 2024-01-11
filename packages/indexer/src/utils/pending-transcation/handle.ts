import { PendingMessage, PendingToken } from "./types";
import { extractOrdersFromCalldata } from "@/events-sync/handlers/royalties/calldata";
import { redis } from "@/common/redis";
import * as es from "@/events-sync/storage";

export async function handlePendingMessage(message: PendingMessage) {
  try {
    const { txContents, txHash } = message;
    // Parse tokens from calldata, only Seaport for now
    const parsedOrders = await extractOrdersFromCalldata(txContents.input);
    const pendingTokens = parsedOrders
      .map((c) => {
        return {
          contract: c.contract,
          tokenId: c.tokenId,
        };
      })
      .filter((c) => c.tokenId != undefined) as PendingToken[];
    if (pendingTokens.length) {
      await addPendingTokens(pendingTokens, txHash);
    }
    return pendingTokens;
  } catch {
    // Skip errors
  }
}

export async function addPendingTokens(tokens: PendingToken[], hash: string) {
  const multi = await redis.multi();
  for (const { contract, tokenId } of tokens) {
    // Use Set to tracking pending tokens
    multi.sadd(`pending-tokens:${contract}`, tokenId);
    // Set a flag to store the status
    multi.set(`pending-token:${contract}:${tokenId}`, 1, "EX", 120);
  }
  // Link the pending tokens to the transcation hash
  multi.set(`pending-tx:${hash}`, JSON.stringify(tokens), "EX", 300);
  await multi.exec();
}

export async function setPendingAsComplete(hashs: string[]) {
  try {
    // Get linked tokens
    const pendingKeys = hashs.map((hash) => `pending-tx:${hash}`);
    const allPendingTokens = await redis
      .mget(pendingKeys)
      .then((c) => c.map((d) => (d ? (JSON.parse(d) as PendingToken[]) : [])));
    if (allPendingTokens.every((c) => c.length === 0)) {
      return;
    }
    const multi = await redis.multi();
    for (let index = 0; index < allPendingTokens.length; index++) {
      const pendingTokens = allPendingTokens[index];
      const hash = hashs[index];
      if (pendingTokens.length) {
        for (const { contract, tokenId } of pendingTokens) {
          // Remove token from set and delete the state
          multi.srem(`pending-tokens:${contract}`, tokenId);
          multi.del(`pending-token:${contract}:${tokenId}`);
        }
        multi.del(`pending-tx:${hash}`);
      }
    }
    await multi.exec();
  } catch {
    // Skip errors
  }
}

export async function handleFillEvents(fillEvents: es.fills.Event[]) {
  try {
    const hashs = Array.from(new Set(fillEvents.map((c) => c.baseEventParams.txHash)));
    await setPendingAsComplete(hashs);
  } catch {
    // Skip errors
  }
}

export async function getContractPendingTokens(contract: string) {
  const key = `pending-tokens:${contract}`;
  const tokenIds = await redis.smembers(key);
  const multi = await redis.multi();
  for (const tokenId of tokenIds) {
    multi.get(`pending-token:${contract}:${tokenId}`);
  }
  const results = await multi.exec();
  const expiredTokenIds: string[] = [];
  const pendingTokenIds = tokenIds.filter((tokenId, index) => {
    if (!results[index]) {
      return false;
    }
    const [error, result] = results[index];
    if (error) return false;
    if (result) {
      return true;
    } else {
      expiredTokenIds.push(tokenId);
      return false;
    }
  });
  if (expiredTokenIds.length) {
    // Clean expired id from set
    await redis.srem(key, expiredTokenIds);
  }
  return pendingTokenIds;
}
