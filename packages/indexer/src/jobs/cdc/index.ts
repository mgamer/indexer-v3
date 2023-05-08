/* eslint-disable @typescript-eslint/no-explicit-any */

import { Kafka, logLevel } from "kafkajs";
import { getServiceName } from "../../config/network";
import { logger } from "@/common/logger";
import { TopicHandlers } from "./topics";
// Create a Kafka client
const kafka = new Kafka({
  clientId: "indexer",
  brokers: ["127.0.0.1:9092"],
  logLevel: logLevel.ERROR,
});

// Function to start the Kafka consumer
export async function startKafkaConsumer(): Promise<void> {
  const consumer = kafka.consumer({ groupId: "indexer-consumer" });
  await consumer.connect();

  // Subscribe to the topics
  await Promise.all(
    TopicHandlers.map((topicHandler) => {
      return consumer.subscribe({ topics: topicHandler.getTopics() });
    })
  );

  await consumer.run({
    eachMessage: async ({ message, topic }) => {
      const event = JSON.parse(message.value!.toString());

      // Find the corresponding topic handler and call the handle method
      for (const handler of TopicHandlers) {
        if (handler.getTopics().includes(topic)) {
          try {
            await handler.handle(event.payload);
          } catch (error) {
            logger.error(
              `${getServiceName()}-kafka-consumer`,
              `Error handling eventName=${event.name}, ${error}`
            );
          }
          break;
        }
      }
    },
  });
}
