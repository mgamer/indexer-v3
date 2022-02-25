import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { v4 as uuidv4 } from 'uuid';
import { DailyVolume } from '@/entities/daily-volumes/daily-volume';

const QUEUE_NAME = "calculate-daily-volumes";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: true,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {

      // Get the startTime and endTime of the day we want to calculate
      const startTime = job.data.startTime;

      const result = await DailyVolume.calculateDay(startTime, true);

      await DailyVolume.updatePreviousDays(startTime - 24 * 3600);

      return true;

    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
}

export const addToQueue = async () => {
  const dayBeginning = new Date();
  dayBeginning.setUTCHours(0,0,0,0);
  const startTime = (dayBeginning.getTime() / 1000) - 24 * 3600;

  await queue.add(uuidv4(), {
    startTime
  });
};
