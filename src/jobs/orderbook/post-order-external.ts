import * as crypto from "crypto";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import axios from "axios";
import * as Sdk from "@reservoir0x/sdk";
import { joinSignature } from "@ethersproject/bytes";

const QUEUE_NAME = "orderbook-post-order-external-queue";
const OPENSEA_RATE_LIMIT_REQUEST_COUNT = 2;
const OPENSEA_RATE_LIMIT_INTERVAL = 1;
const LOOKSRARE_RATE_LIMIT_REQUEST_COUNT = 2;
const LOOKSRARE_RATE_LIMIT_INTERVAL = 1;

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
      const { orderData, orderbook, orderbookApiKeyEncrypted } =
        job.data as PostOrderExternalParams;

      if (![1, 4].includes(config.chainId)) {
        throw new Error("Unsupported network");
      }

      if (!["opensea", "looks-rare"].includes(orderbook)) {
        throw new Error("Unsupported orderbook");
      }

      let orderbookApiKey = null;
      let orderbookApiKeyHash = null;

      if (orderbookApiKeyEncrypted) {
        orderbookApiKey = decryptApiKey(orderbookApiKeyEncrypted);
        orderbookApiKeyHash = crypto.createHash("md5").update(orderbookApiKey).digest("hex");
      }

      const apiKeyRateLimitReached = await reachedApiKeyRateLimit(orderbook, orderbookApiKeyHash);

      if (apiKeyRateLimitReached) {
        const rateLimitKey = getApiKeyRateLimitRedisKey(orderbook, orderbookApiKeyHash);
        const rateLimitKeyTTL = await redis.ttl(rateLimitKey);
        const delayMS = rateLimitKeyTTL * 1000;

        logger.info(
          QUEUE_NAME,
          `Post Order Rate Limited. orderbook: ${orderbook}, orderbookApiKeyHash: ${orderbookApiKeyHash}, rateLimitKey: ${rateLimitKey}, rateLimitKeyTTL: ${rateLimitKeyTTL}, delayMS: ${delayMS}`
        );

        await addToQueue(orderData, orderbook, orderbookApiKeyEncrypted, delayMS);
      } else {
        try {
          await postOrder(orderbook, orderData, orderbookApiKey);
        } catch (error) {
          if (error instanceof RequestWasThrottledError) {
            const delayMS = error.delay * 1000;

            logger.info(
              QUEUE_NAME,
              `Post Order Throttled. orderbook: ${orderbook}, orderbookApiKeyHash: ${orderbookApiKeyHash}, delayMS: ${delayMS}`
            );

            await addToQueue(orderData, orderbook, orderbookApiKeyEncrypted, delayMS);
          } else {
            throw error;
          }
        }
      }
    },
    {
      connection: redis.duplicate(),
      concurrency: 3,
    }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type PostOrderExternalParams = {
  orderData: Record<string, unknown>;
  orderbook: string;
  orderbookApiKeyEncrypted: string;
};

const getApiKeyRateLimitRedisKey = (orderbook: string, apiKeyHash: string | null) => {
  let rateLimitKey = "orderbook-post-order-external" + ":" + orderbook;

  if (apiKeyHash) {
    rateLimitKey = rateLimitKey + ":" + apiKeyHash;
  }

  return rateLimitKey;
};

const reachedApiKeyRateLimit = async (orderbook: string, apiKeyHash: string | null) => {
  let rateLimitRequestCount = 2;
  let rateLimitInterval = 1;

  switch (orderbook) {
    case "opensea":
      rateLimitRequestCount = OPENSEA_RATE_LIMIT_REQUEST_COUNT;
      rateLimitInterval = OPENSEA_RATE_LIMIT_INTERVAL;
      break;
    case "looks-rare":
      rateLimitRequestCount = LOOKSRARE_RATE_LIMIT_REQUEST_COUNT;
      rateLimitInterval = LOOKSRARE_RATE_LIMIT_INTERVAL;
      break;
  }

  const rateLimitKey = getApiKeyRateLimitRedisKey(orderbook, apiKeyHash);
  const current = await redis.incr(rateLimitKey);

  if (current == 1) {
    await redis.expire(rateLimitKey, rateLimitInterval);
  }

  return current > rateLimitRequestCount;
};

const postOrder = async (
  orderbook: string,
  orderData: Record<string, unknown>,
  orderbookApiKey: string | null
) => {
  switch (orderbook) {
    case "opensea":
      return postOpenSea(orderData, orderbookApiKey);
    case "looks-rare":
      return postLooksRare(orderData, orderbookApiKey);
  }

  throw new Error(`Unsupported orderbook ${orderbook}`);
};

const postOpenSea = async (orderData: Record<string, unknown>, apiKey: string | null) => {
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
          const delay = detailParts[detailParts.length - 2];

          throw new RequestWasThrottledError("Request was throttled by OpenSea", delay);
        }
      }

      throw new Error(`Failed to post order.`);
    });
};

const postLooksRare = async (orderData: Record<string, unknown>, apiKey: string | null) => {
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
  delay = 0
) => {
  const orderbookApiKeyEncrypted = orderbookApiKey ? encryptApiKey(orderbookApiKey) : null;

  await queue.add(
    crypto.randomUUID(),
    {
      orderData,
      orderbook,
      orderbookApiKeyEncrypted,
    },
    {
      delay,
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
