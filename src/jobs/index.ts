// Initialize all background jobs/processes

import "@/jobs/blocks-fetch";
import "@/jobs/cache-check";
import "@/jobs/events-fix";
import "@/jobs/events-sync";
import "@/jobs/metadata-index";
import "@/jobs/orders-relay";
import "@/jobs/orders-update";
import "@/jobs/orders-sync";

import * as eventsSync from "@/jobs/events-sync";
import * as fillsHandle from "@/jobs/fills-handle";
import * as metadataIndex from "@/jobs/metadata-index";
import * as ordersSync from "@/jobs/orders-sync";
import * as ordersUpdate from "@/jobs/orders-update";

export const allQueues = [
  eventsSync.backfillQueue,
  eventsSync.catchupQueue,
  fillsHandle.queue,
  metadataIndex.queue,
  ordersSync.backfillQueue,
  ordersSync.catchupQueue,
  ordersUpdate.byHashQueue,
  ordersUpdate.byMakerQueue,
];
