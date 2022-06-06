import { config } from "@/config/index";
import { redlock } from "@/common/redis";
import { idb } from "@/common/db";

import "@/jobs/data-export/export-data";
import { addToQueue } from "@/jobs/data-export/export-data";

const getActiveTasks = async () => {
  return await idb.manyOrNone(`SELECT source FROM data_export_tasks`);
};

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  getActiveTasks()
    .then(async (tasks) => {
      for (const task of tasks) {
        redlock
          .acquire([`${task.source}-backfill-lock`], 60 * 60 * 24 * 30 * 1000)
          .then(async () => {
            await addToQueue(task.source, true);
          })
          .catch(() => {
            // Skip on any errors
          });
      }
    })
    .catch(() => {
      // Skip on any errors
    });
}
