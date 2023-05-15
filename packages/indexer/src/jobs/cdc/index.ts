import { Kafka, logLevel } from "kafkajs";

import { config } from "@/config/index";
import { TopicHandlers } from "@/jobs/cdc/topics";

// // Create a Kafka client
const kafka = new Kafka({
  brokers: [
    "main-kafka-0.main-kafka-brokers.kafka.svc:9092",
    "main-kafka-1.main-kafka-brokers.kafka.svc:9092",
    "main-kafka-2.main-kafka-brokers.kafka.svc:9092",
    "main-kafka-3.main-kafka-brokers.kafka.svc:9092",
    "main-kafka-4.main-kafka-brokers.kafka.svc:9092",
  ],
  logLevel: logLevel.DEBUG,
});

export const producer = kafka.producer();
export const consumer = kafka.consumer({
  groupId: config.kafkaConsumerGroupId,
});
// Function to start the Kafka producer
export async function startKafkaProducer(): Promise<void> {
  await producer.connect();
}

// // Function to start the Kafka consumer
export async function startKafkaConsumer(): Promise<void> {
  await consumer.connect();

  // Subscribe to the topics
  await Promise.all(
    TopicHandlers.map((topicHandler) => {
      return consumer.subscribe({ topics: topicHandler.getTopics() });
    })
  );

  await consumer.run({
    partitionsConsumedConcurrently: 1,

    eachMessage: async ({ message, topic }) => {
      const event = JSON.parse(message.value!.toString());
      // eslint-disable-next-line no-console
      console.log("event", event);

      // Find the corresponding topic handler and call the handle method on it, if the topic is not a dead letter topic

      if (topic.endsWith("-dead-letter")) {
        // if topic is dead letter, no need to process it
        return;
      }

      for (const handler of TopicHandlers) {
        if (handler.getTopics().includes(topic)) {
          try {
            // If the event has not been retried before, set the retryCount to 0
            if (!event.payload.retryCount) {
              event.payload.retryCount = 0;
            }

            await handler.handle(event.payload);
          } catch (error) {
            // logger.error(
            //   `${getServiceName()}-kafka-consumer`,
            //   `Error handling eventName=${event.name}, ${error}`
            // );
          }
          break;
        }
      }
    },
  });
}

// eslint-disable-next-line
console.log("Starting Kafka producer and consumer", config);

startKafkaProducer();
startKafkaConsumer();
