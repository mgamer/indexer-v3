/* eslint-disable @typescript-eslint/no-explicit-any */

// Abstract class needed to be implemented in order to process job from rabbit
import { config } from "@/config/index";
import { RabbitMq, RabbitMQMessage } from "@/common/rabbit-mq";
import { logger } from "@/common/logger";
import { ConsumeMessage } from "amqplib";
import _ from "lodash";

export type BackoffStrategy =
  | {
      type: "exponential";
      delay: number;
    }
  | {
      type: "fixed";
      delay: number;
    }
  | null;

export abstract class AbstractRabbitMqJobHandler {
  abstract queueName: string;
  abstract maxRetries: number;

  protected concurrency = 1;
  protected maxDeadLetterQueue = 5000;
  protected backoff: BackoffStrategy = null;

  public async consume(payload: ConsumeMessage): Promise<void> {
    const message = JSON.parse(payload.content.toString()) as RabbitMQMessage;
    message.consumedTime = message.consumedTime ?? _.now();
    message.retryCount = message.retryCount ?? 0;

    try {
      await this.process(message.payload);
      message.completeTime = _.now();
    } catch (error) {
      message.retryCount += 1;
      let queueName = this.getErrorQueue();

      // If the event has already been retried maxRetries times, send it to the dead letter queue
      if (message.retryCount > this.maxRetries) {
        queueName = this.getDeadLetterQueue();
      }

      logger.error(
        this.getQueue(),
        `Error handling event: ${error}, queueName=${queueName}, payload=${JSON.stringify(
          message
        )}, retryCount=${message.retryCount}`
      );

      // Set the backoff strategy delay
      const delay = this.getBackoffDelay(message);

      await RabbitMq.send(queueName, message, delay);
    }
  }

  public getBackoffDelay(message: RabbitMQMessage) {
    let delay = 0;
    if (this.backoff) {
      switch (this.backoff.type) {
        case "fixed":
          delay = this.backoff.delay;
          break;

        case "exponential":
          delay = 2 ^ ((Number(message.retryCount) - 1) * this.backoff.delay);
          break;
      }
    }

    return delay;
  }

  public getQueue(): string {
    return `${config.chainId}.${this.queueName}`;
  }

  public getErrorQueue(queueName?: string): string {
    if (queueName) {
      return `${queueName}-error`;
    }

    return `${this.getQueue()}-error`;
  }

  public getDeadLetterQueue(): string {
    return `${this.getQueue()}-dead-letter`;
  }

  public getConcurrency(): number {
    return this.concurrency;
  }

  public getMaxDeadLetterQueue(): number {
    return this.maxDeadLetterQueue;
  }

  public getBackoff(): BackoffStrategy {
    return this.backoff;
  }

  protected abstract process(payload: any): Promise<void>;
}
