// Initialize all background jobs/processes

import "@/jobs/events-sync";

import * as eventsSync from "@/jobs/events-sync";

export const allJobQueues = [
  eventsSync.backfillQueue,
  eventsSync.realtimeQueue,
];
