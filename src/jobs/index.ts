// Initialize all background jobs/processes

import "@/jobs/events-sync";

import * as eventsSyncBackfill from "@/jobs/events-sync/backfill-queue";
import * as eventsSyncRealtime from "@/jobs/events-sync/realtime-queue";
import * as eventsSyncFtTransfersWrite from "@/jobs/events-sync/ft-transfers-write-queue";
import * as eventsSyncNftTransfersWrite from "@/jobs/events-sync/nft-transfers-write-queue";

export const allJobQueues = [
  eventsSyncBackfill.queue,
  eventsSyncRealtime.queue,
  eventsSyncFtTransfersWrite.queue,
  eventsSyncNftTransfersWrite.queue,
];
