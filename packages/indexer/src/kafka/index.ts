/* eslint-disable @typescript-eslint/no-explicit-any */

// kafkaService.ts
import { Kafka, logLevel } from "kafkajs";
import { getServiceName } from "../config/network";
import { logger } from "@/common/logger";
import { IndexerOrderEventsHandler } from "./topics/debeezium/indexer-order-events";
import { KafkaTopics } from "./topics";
// Create a Kafka client
const kafka = new Kafka({
  clientId: "indexer",
  brokers: ["127.0.0.1:9092"],
  logLevel: logLevel.ERROR,
});

// Define topic handler interface
export interface KafkaTopicHandler {
  topicName: string;
  handle(payload: any): Promise<void>;
  handleInsert(payload: any): Promise<void>;
  handleUpdate(payload: any): Promise<void>;
  handleDelete(payload: any): Promise<void>;
}

// Register topic handlers
const topicHandlers: KafkaTopicHandler[] = [new IndexerOrderEventsHandler()];

// Function to start the Kafka consumer
export async function startKafkaConsumer(): Promise<void> {
  const consumer = kafka.consumer({ groupId: "indexer-consumer" });
  await consumer.connect();

  // Subscribe to the topics
  await Promise.all(
    KafkaTopics.map((topic) => {
      return consumer.subscribe({ topic });
    })
  );

  await consumer.run({
    eachMessage: async ({ message, topic }) => {
      const event = JSON.parse(message.value!.toString());

      // Find the corresponding topic handler and call the handle method
      for (const handler of topicHandlers) {
        if (handler.topicName === topic) {
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
