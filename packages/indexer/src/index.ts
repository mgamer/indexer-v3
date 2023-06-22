import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/jobs/index";
import "@/jobs/cdc/index";
import "@/common/tracer";
import "@/config/polyfills";
import "@/pubsub/index";
import "@/websockets/index";

import { start } from "@/api/index";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { initIndexes } from "@/elasticsearch/indexes";
import { startKafkaConsumer } from "@/jobs/cdc/index";
import { RabbitMq } from "@/common/rabbit-mq";
import { RabbitMqJobsConsumer } from "@/jobs/index";
import { Sources } from "@/models/sources";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
process.on("unhandledRejection", (error: any) => {
  logger.error("process", `Unhandled rejection: ${error} (${error.stack})`);

  // For now, just skip any unhandled errors
  // process.exit(1);
});

const setup = async () => {
  if (process.env.LOCAL_TESTING) {
    return;
  }

  const time1 = performance.now();
  await RabbitMq.connect(); // Connect the rabbitmq
  await RabbitMq.assertQueuesAndExchanges(); // Assert queues and exchanges
  const time2 = performance.now();
  logger.info(
    "debug-perfomance",
    JSON.stringify({ rabbitConnectAndAssert: (time2 - time1) / 1000 })
  );

  if (config.doKafkaWork) {
    const time3 = performance.now();
    await startKafkaConsumer();
    const time4 = performance.now();
    logger.info("debug-perfomance", JSON.stringify({ kafkaConsumer: (time4 - time3) / 1000 }));
  }

  // if ((config.doKafkaWork || config.doBackgroundWork) && config.kafkaBrokers.length > 0) {
  //   await startKafkaProducer();
  // }

  if (config.doBackgroundWork) {
    const time4 = performance.now();
    await Sources.syncSources();
    const time5 = performance.now();
    logger.info("debug-perfomance", JSON.stringify({ sourcesSync: (time5 - time4) / 1000 }));

    const time6 = performance.now();
    await RabbitMqJobsConsumer.startRabbitJobsConsumer();
    const time7 = performance.now();
    logger.info("debug-perfomance", JSON.stringify({ rabbitConsumer: (time7 - time6) / 1000 }));

    const networkSettings = getNetworkSettings();
    if (networkSettings.onStartup) {
      const time9 = performance.now();
      await networkSettings.onStartup();
      const time10 = performance.now();
      logger.info("debug-perfomance", JSON.stringify({ onStartup: (time10 - time9) / 1000 }));
    }
  }

  const time6 = performance.now();
  await Sources.getInstance();
  await Sources.forceDataReload();
  const time7 = performance.now();
  logger.info("debug-perfomance", JSON.stringify({ sourcesReload: (time7 - time6) / 1000 }));

  if (config.doElasticsearchWork) {
    const time8 = performance.now();
    await initIndexes();
    const time9 = performance.now();
    logger.info("debug-perfomance", JSON.stringify({ elasticSearch: (time9 - time8) / 1000 }));
  }
};

setup().then(() => start());
