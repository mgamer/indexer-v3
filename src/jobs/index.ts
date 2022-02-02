// Initialize all background jobs/processes

import "@/jobs/events-sync";

import * as eventsSyncBackfill from "@/jobs/events-sync/backfill-queue";
import * as eventsSyncRealtime from "@/jobs/events-sync/realtime-queue";
import * as eventsSyncWrite from "@/jobs/events-sync/write-queue";

export const allJobQueues = [
  eventsSyncBackfill.queue,
  eventsSyncRealtime.queue,
  eventsSyncWrite.queue,
];
