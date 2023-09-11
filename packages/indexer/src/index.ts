import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/common/tracer";

import { RabbitMq } from "@/common/rabbit-mq";
import { acquireLock, redis } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import _ from "lodash";
import MetadataApi from "./utils/metadata-api";

if (process.env.LOCAL_TESTING) {
  import("./setup");
} else {
  RabbitMq.createVhost()
    .then(() => RabbitMq.connect())
    .then(async () => {
      // Sync the pods so rabbit queues assertion will run only once per deployment by a single pod
      if (await acquireLock(config.imageTag, 75)) {
        const start = _.now();
        logger.info("rabbit-timing", `rabbit assertion starting in ${start}`);
        await RabbitMq.assertQueuesAndExchanges();
        logger.info("rabbit-timing", `rabbit assertion done in ${_.now() - start}ms`);
        await redis.set(config.imageTag, "DONE", "EX", 60 * 60 * 24); // Update the lock ttl
        import("./setup");
      } else {
        // Check every 1s if the rabbit queues assertion completed
        const intervalId = setInterval(async () => {
          if ((await redis.get(config.imageTag)) === "DONE") {
            clearInterval(intervalId);
            import("./setup");
          }
        }, 1000);
      }
    })
    .catch((error) => {
      logger.error("rabbit-publisher-connect", `Error connecting to rabbit ${error}`);
    });
}

MetadataApi.getTokensMetadata([
  {
    contract: "0x60e4d786628fea6478f785a6d7e704777c86a7c6",
    tokenId: "10",
  },
]).then((res) => {
  // eslint-disable-next-line
  console.log(res);
});
