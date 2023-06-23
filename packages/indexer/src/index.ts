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
import { idb } from "@/common/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
process.on("unhandledRejection", (error: any) => {
  logger.error("process", `Unhandled rejection: ${error} (${error.stack})`);

  // For now, just skip any unhandled errors
  // process.exit(1);
});

const setup = async () => {
  try {
    await idb.none(
      `
      with x as (select collection_mints.collection_id from collection_mints join collection_mint_standards on collection_mints.collection_id = collection_mint_standards.collection_id where standard = 'thirdweb') update collection_mints set stage = 'claim-0' from x where collection_mints.collection_id = x.collection_id and stage != 'claim-0'
      `
    );
  } catch {
    // skip errors
  }

  if (process.env.LOCAL_TESTING) {
    return;
  }

  await RabbitMq.connect(); // Connect the rabbitmq
  await RabbitMq.assertQueuesAndExchanges(); // Assert queues and exchanges

  if (config.doKafkaWork) {
    await startKafkaConsumer();
  }

  // if ((config.doKafkaWork || config.doBackgroundWork) && config.kafkaBrokers.length > 0) {
  //   await startKafkaProducer();
  // }

  if (config.doBackgroundWork) {
    await Sources.syncSources();
    await RabbitMqJobsConsumer.startRabbitJobsConsumer();

    const networkSettings = getNetworkSettings();
    if (networkSettings.onStartup) {
      await networkSettings.onStartup();
    }
  }

  await Sources.getInstance();
  await Sources.forceDataReload();

  if (config.doElasticsearchWork) {
    await initIndexes();
  }
};

setup().then(() => start());
