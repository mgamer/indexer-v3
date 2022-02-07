import Redis from "ioredis";
import Redlock from "redlock";

import { config } from "@/config/index";

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// https://redis.io/topics/distlock
export const redlock = new Redlock([redis.duplicate()], { retryCount: 0 });
