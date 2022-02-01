import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";

import { config } from "@/config/index";

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// The locking mechanism used here is not perfect. It only provides
// weak guarantees of mutual exclusion. As such, it is not suitable
// for critical operations which cannot handle race conditions. The
// algorithm is described in the first part of the article below:
// https://redis.io/topics/distlock.

const lockIds = new Map<string, string>();

export const acquireLock = async (
  name: string,
  expirationInSeconds: number
) => {
  const id = uuidv4();
  lockIds.set(name, id);

  const acquired = await redis.set(name, id, "EX", expirationInSeconds, "NX");
  return acquired === "OK";
};

export const releaseLock = async (name: string) => {
  const currentId = await redis.get(name);
  if (currentId === lockIds.get(name)) {
    await redis.del(name);
  }
};
