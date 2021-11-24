import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";

import { config } from "@/config/index";

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// As in https://redis.io/topics/distlock
const lockIds = new Map<string, string>();

export const acquireLock = async (
  name: string,
  expirationInSeconds: number
) => {
  const id = uuidv4();
  lockIds.set(name, id);

  const acquired = await redis.set(name, id, "ex", expirationInSeconds);
  return acquired === "OK";
};

export const releaseLock = async (name: string) => {
  const currentId = await redis.get(name);
  if (currentId === lockIds.get(name)) {
    await redis.del(name);
  }
};
