import { idb } from "@/common/db";
import { redis } from "@/common/redis";

export const isTakedownToken = async (contract: string, tokenId: string) => {
  const token = `${contract}:${tokenId}`;
  let active = await redis.get(`token-takedown:${token}`);

  if (!active) {
    active = await idb.oneOrNone(
      `
        SELECT
          active
        FROM takedowns t
        WHERE t.id = $/id/
        AND t.type = 'token'
    `,
      {
        id: token,
      }
    );

    await redis.set(`token-takedown:${token}`, active ? 1 : 0, "EX", 3600);
  }

  return active;
};

export const isTakedownCollection = async (collectionId: string) => {
  let active = await redis.get(`collection-takedown:${collectionId}`);

  if (!active) {
    active = await idb.oneOrNone(
      `
        SELECT
          active
        FROM takedowns t
        WHERE t.id = $/id/
        AND t.type = 'collection'
    `,
      {
        id: collectionId,
      }
    );

    await redis.set(`collection-takedown:${collectionId}`, active ? 1 : 0, "EX", 3600);
  }

  return active;
};
