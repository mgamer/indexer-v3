/* eslint-disable @typescript-eslint/no-explicit-any */

// kafkaService.ts
import { Kafka, logLevel } from "kafkajs";
import { getServiceName } from "../config/network";
import { logger } from "@/common/logger";
import { DatabaseUpdateHandler } from "kafka/database-update-handler";
// Create a Kafka client
const kafka = new Kafka({
  clientId: "my-app",
  brokers: ["kafka-broker1:9092", "kafka-broker2:9092"],
  logLevel: logLevel.ERROR,
});

// Define event handler interface
export interface KafkaEventHandler {
  eventName: string;
  handle(payload: any): Promise<void>;
}

// Register event handlers
const eventHandlers: KafkaEventHandler[] = [new DatabaseUpdateHandler()];

// Function to start the Kafka consumer
export async function startKafkaConsumer(): Promise<void> {
  const consumer = kafka.consumer({ groupId: "my-group" });

  await consumer.connect();
  // TODO: Do we want multiple topics for different events? Or one topic for all events?
  await consumer.subscribe({ topic: "events", fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value!.toString());

      // Find the corresponding event handler and call the handle method
      for (const handler of eventHandlers) {
        if (handler.eventName === event.name) {
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
