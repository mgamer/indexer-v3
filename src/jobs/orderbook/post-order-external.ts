import * as crypto from "crypto";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import axios from "axios";
import * as Sdk from "@reservoir0x/sdk";
import { joinSignature } from "@ethersproject/bytes";

const QUEUE_NAME = "orderbook-post-order-external-queue";

// Open Sea default rate limit - 2 requests per second for post apis
const OPENSEA_RATE_LIMIT_REQUEST_COUNT = 2;
const OPENSEA_RATE_LIMIT_INTERVAL = 1000;

// Looks Rare default rate limit - 120 requests per minute
const LOOKSRARE_RATE_LIMIT_REQUEST_COUNT = 120;
const LOOKSRARE_RATE_LIMIT_INTERVAL = 1000 * 60;

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "fixed",
      delay: 5000,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 60000,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { orderData, orderbook, orderbookApiKeyEncrypted, retry } =
        job.data as PostOrderExternalParams;

      if (![1, 4].includes(config.chainId)) {
        throw new Error("Unsupported network");
      }

      if (!["opensea", "looks-rare"].includes(orderbook)) {
        throw new Error("Unsupported orderbook");
      }

      // Decrypt api key if passed, otherwise get the default api key.
      const orderbookApiKey = orderbookApiKeyEncrypted
        ? decryptApiKey(orderbookApiKeyEncrypted)
        : getOrderbookDefaultApiKey(orderbook);
      const apiKeyRateLimitReached = await reachedApiKeyRateLimit(orderbook, orderbookApiKey);

      if (apiKeyRateLimitReached) {
        // If limit reached, reschedule job based on the limit expiration.
        const rateLimitKey = getApiKeyRateLimitRedisKey(orderbook, orderbookApiKey);
        const delay = await redis.pttl(rateLimitKey);

        logger.info(
          QUEUE_NAME,
          `Post Order Rate Limited. orderbook: ${orderbook}, orderbookApiKey: ${orderbookApiKey}, rateLimitKey: ${rateLimitKey}, delay: ${delay}, retry: ${retry}`
        );

        job.data.retryJob = true;
        job.data.retryJobDelay = delay;
      } else {
        try {
          await postOrder(orderbook, orderData, orderbookApiKey);
        } catch (error) {
          if (error instanceof RequestWasThrottledError) {
            // If we got throttled by the api, reschedule job based on the provided delay.
            const rateLimitKey = getApiKeyRateLimitRedisKey(orderbook, orderbookApiKey);
            const delay = error.delay;

            // Extend the rate limit expiration.
            await redis.pexpire(rateLimitKey, delay);

            job.data.retryJob = true;
            job.data.retryJobDelay = delay;

            logger.info(
              QUEUE_NAME,
              `Post Order Throttled. orderbook: ${orderbook}, orderbookApiKey: ${orderbookApiKey}, delay: ${delay}, retry: ${retry}`
            );
          } else {
            // If we got an error from the api, reschedule job based on fixed delay.
            job.data.retryJob = true;
            job.data.retryJobDelay = 5000;

            logger.error(
              QUEUE_NAME,
              `Post Order Error. orderbook: ${orderbook}, orderbookApiKey: ${orderbookApiKey}, retry: ${retry}, error: ${error}`
            );
          }
        }
      }
    },
    {
      connection: redis.duplicate(),
      concurrency: 3,
    }
  );

  worker.on("completed", async (job) => {
    if (job.data.retryJob) {
      const retry = job.data.retry + 1;
      const delay = job.data.retryJobDelay;

      if (retry <= 5) {
        let orderbookApiKey = null;

        if (job.data.orderbookApiKeyEncrypted) {
          orderbookApiKey = decryptApiKey(job.data.orderbookApiKeyEncrypted);
        }

        await addToQueue(
          job.data.orderData,
          job.data.orderbook,
          orderbookApiKey,
          retry,
          delay,
          true
        );
      } else {
        logger.error(
          QUEUE_NAME,
          `Max Retries Reached. orderbook: ${job.data.orderbook}, orderbookApiKey: ${job.data.orderbookApiKey}`
        );
      }
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type PostOrderExternalParams = {
  orderData: Record<string, unknown>;
  orderbook: string;
  orderbookApiKeyEncrypted: string;
  retry: number;
};

const getOrderbookDefaultApiKey = (orderbook: string) => {
  switch (orderbook) {
    case "opensea":
      return config.openSeaApiKey;
    case "looks-rare":
      return config.looksRareApiKey;
  }

  throw new Error(`Unsupported orderbook ${orderbook}`);
};

const getApiKeyRateLimitRedisKey = (orderbook: string, orderbookApiKey: string) => {
  return "orderbook-post-order-external" + ":" + orderbook + ":" + orderbookApiKey;
};

const reachedApiKeyRateLimit = async (orderbook: string, orderbookApiKey: string) => {
  let rateLimitRequestCount;
  let rateLimitInterval;

  switch (orderbook) {
    case "looks-rare":
      rateLimitRequestCount = LOOKSRARE_RATE_LIMIT_REQUEST_COUNT;
      rateLimitInterval = LOOKSRARE_RATE_LIMIT_INTERVAL;
      break;
    case "opensea":
    default:
      rateLimitRequestCount = OPENSEA_RATE_LIMIT_REQUEST_COUNT;
      rateLimitInterval = OPENSEA_RATE_LIMIT_INTERVAL;
      break;
  }

  const rateLimitKey = getApiKeyRateLimitRedisKey(orderbook, orderbookApiKey);

  // Always increment count.
  const current = await redis.incr(rateLimitKey);

  if (current == 1) {
    await redis.pexpire(rateLimitKey, rateLimitInterval);
  }

  return current > rateLimitRequestCount;
};

const postOrder = async (
  orderbook: string,
  orderData: Record<string, unknown>,
  orderbookApiKey: string
) => {
  switch (orderbook) {
    case "opensea":
      return postOpenSea(orderData, orderbookApiKey);
    case "looks-rare":
      return postLooksRare(orderData, orderbookApiKey);
  }

  throw new Error(`Unsupported orderbook ${orderbook}`);
};

const postOpenSea = async (orderData: Record<string, unknown>, apiKey: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdkOrder = new Sdk.Seaport.Order(config.chainId, orderData as any);

  await axios
    .post(
      `https://${config.chainId === 4 ? "testnets-api." : "api."}opensea.io/v2/orders/${
        config.chainId === 4 ? "rinkeby" : "ethereum"
      }/seaport/${sdkOrder.getInfo()?.side === "sell" ? "listings" : "offers"}`,
      JSON.stringify({
        parameters: {
          ...sdkOrder.params,
          totalOriginalConsiderationItems: sdkOrder.params.consideration.length,
        },
        signature: sdkOrder.params.signature!,
      }),
      {
        headers:
          config.chainId === 1
            ? {
                "Content-Type": "application/json",
                "X-Api-Key": apiKey || config.openSeaApiKey,
              }
            : {
                "Content-Type": "application/json",
                // The request will fail if passing the API key on Rinkeby
              },
      }
    )
    .catch((error) => {
      if (error.response) {
        logger.error(
          QUEUE_NAME,
          `Failed to post order to OpenSea: ${JSON.stringify(error.response.data)}`
        );

        if (
          error.response.data.detail?.startsWith("Request was throttled. Expected available in")
        ) {
          const detailParts = error.response.data.detail.split(" ");
          const delay = detailParts[detailParts.length - 2] * 1000;

          throw new RequestWasThrottledError("Request was throttled by OpenSea", delay);
        }
      }

      throw new Error(`Failed to post order.`);
    });
};

const postLooksRare = async (orderData: Record<string, unknown>, apiKey: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdkOrder = new Sdk.LooksRare.Order(config.chainId, orderData as any);
  const lrOrder = {
    ...sdkOrder.params,
    signature: joinSignature({
      v: sdkOrder.params.v!,
      r: sdkOrder.params.r!,
      s: sdkOrder.params.s!,
    }),
    tokenId: sdkOrder.params.kind === "single-token" ? sdkOrder.params.tokenId : null,
    // For now, no order kinds have any additional params
    params: [],
  };

  await axios
    .post(
      `https://${config.chainId === 4 ? "api-rinkeby." : "api."}looksrare.org/api/v1/orders`,
      JSON.stringify(lrOrder),
      {
        headers: {
          "Content-Type": "application/json",
          "X-Looks-Api-Key": apiKey || config.looksRareApiKey,
        },
      }
    )
    .catch((error) => {
      if (error.response) {
        logger.error(
          QUEUE_NAME,
          `Failed to post order to LooksRare: ${JSON.stringify(error.response.data)}`
        );
      }

      throw new Error(`Failed to post order.`);
    });
};

const decryptApiKey = (apiKeyHash: string) => {
  const [iv, encrypted] = apiKeyHash.split(":");
  const key = crypto.scryptSync(config.orderbookPostOrderExternalEncryptionKey, "salt", 32);

  const decipher = crypto.createDecipheriv("aes-256-ctr", key, Buffer.from(iv, "hex"));
  const decrpyted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "hex")),
    decipher.final(),
  ]);

  return decrpyted.toString();
};

export const encryptApiKey = (apiKey: string) => {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(config.orderbookPostOrderExternalEncryptionKey, "salt", 32);
  const cipher = crypto.createCipheriv("aes-256-ctr", key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey), cipher.final()]);

  return iv.toString("hex") + ":" + encrypted.toString("hex");
};

export const addToQueue = async (
  orderData: Record<string, unknown>,
  orderbook: string,
  orderbookApiKey: string | null,
  retry = 0,
  delay = 0,
  prioritized = false
) => {
  // Encrypt api key so it won't be visible in bullmq admin ui.
  const orderbookApiKeyEncrypted = orderbookApiKey ? encryptApiKey(orderbookApiKey) : null;

  await queue.add(
    crypto.randomUUID(),
    {
      orderData,
      orderbook,
      orderbookApiKeyEncrypted,
      retry,
    },
    {
      delay,
      priority: prioritized ? 1 : undefined,
    }
  );
};

export class RequestWasThrottledError extends Error {
  delay = 0;

  constructor(message: string, delay: number) {
    super(message);
    this.delay = delay;

    Object.setPrototypeOf(this, RequestWasThrottledError.prototype);
  }
}
