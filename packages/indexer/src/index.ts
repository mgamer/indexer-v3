import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@/jobs/cdc/index";
import "@/common/tracer";
import "@/config/polyfills";
import "@/jobs/index";
import "@/pubsub/index";
import "@/websockets/index";

import { start } from "@/api/index";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { initIndexes } from "@/elasticsearch/indexes";
import { Sources } from "@/models/sources";
import { startKafkaConsumer, startKafkaProducer } from "@/jobs/cdc/index";
import { RabbitMq } from "@/common/rabbit-mq";
import { RabbitMqJobsConsumer } from "@/jobs/index";

import * as Sdk from "@reservoir0x/sdk";
import { refresh } from "@/utils/seaport-conduits";

process.on("unhandledRejection", (error) => {
  logger.error("process", `Unhandled rejection: ${error}`);

  // For now, just skip any unhandled errors
  // process.exit(1);
});

const setup = async () => {
  try {
    const conduits = [
      Sdk.SeaportBase.Addresses.OpenseaConduitKey[config.chainId],
      Sdk.SeaportBase.Addresses.OriginConduitKey[config.chainId],
      Sdk.SeaportBase.Addresses.SpaceIdConduitKey[config.chainId],
      Sdk.SeaportBase.Addresses.ReservoirConduitKey[config.chainId],
    ];
    await Promise.all(
      conduits.map(async (c) => {
        try {
          await refresh(new Sdk.SeaportBase.ConduitController(config.chainId).deriveConduit(c));
        } catch {
          // Skip errors
        }
      })
    );
  } catch {
    // Skip errors
  }

  if (process.env.LOCAL_TESTING) {
    return;
  }

  await RabbitMq.connect(); // Connect the rabbitmq
  await RabbitMq.assertQueuesAndExchanges(); // Assert queues and exchanges

  if (config.doBackgroundWork) {
    await Sources.syncSources();
    await RabbitMqJobsConsumer.startRabbitJobsConsumer();

    const networkSettings = getNetworkSettings();
    if (networkSettings.onStartup) {
      await networkSettings.onStartup();
    }
  }

  if (config.doKafkaWork) {
    startKafkaConsumer();
    startKafkaProducer();
  }

  await Sources.getInstance();
  await Sources.forceDataReload();

  if (config.doElasticsearchWork) {
    await initIndexes();
  }
};

setup().then(() => start());
