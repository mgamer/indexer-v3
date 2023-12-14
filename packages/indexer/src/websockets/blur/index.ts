import * as Sdk from "@reservoir0x/sdk";
import { io } from "socket.io-client";

import _ from "lodash";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { blurBidsBufferJob } from "@/jobs/order-updates/misc/blur-bids-buffer-job";
import { blurListingsRefreshJob } from "@/jobs/order-updates/misc/blur-listings-refresh-job";
import { orderbookOrdersJob } from "@/jobs/orderbook/orderbook-orders-job";

const COMPONENT = "blur-websocket";

if (config.chainId === 1 && config.doWebsocketWork && config.blurWsUrl && config.blurWsApiKey) {
  const client = io(config.blurWsUrl, {
    transports: ["websocket"],
    auth: {
      "api-key": config.blurWsApiKey,
    },
  });

  client.on("connect", () => {
    logger.info(COMPONENT, `Connected to Blur via websocket (${config.blurWsUrl})`);
  });

  client.on("connect_error", (error) => {
    logger.error(COMPONENT, `Error from Blur websocket: ${error}`);
  });

  // Listings
  client.on("newTopsOfBooks", async (message: string) => {
    try {
      const parsedMessage: {
        contractAddress: string;
        tops: {
          tokenId: string;
          topAsk: {
            amount: string;
            unit: string;
            createdAt: string;
            marketplace: string;
          } | null;
        }[];
      } = JSON.parse(message);

      const collection = parsedMessage.contractAddress.toLowerCase();
      const orderInfos = parsedMessage.tops.map((t) => ({
        kind: "blur-listing",
        info: {
          orderParams: {
            collection,
            tokenId: t.tokenId,
            price: t.topAsk?.marketplace === "BLUR" ? t.topAsk.amount : undefined,
            createdAt: t.topAsk?.marketplace === "BLUR" ? t.topAsk.createdAt : undefined,
            fromWebsocket: true,
          },
          metadata: {},
        },
        ingestMethod: "websocket",
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await orderbookOrdersJob.addToQueue(orderInfos as any);

      await blurListingsRefreshJob.addToQueue(collection);
    } catch (error) {
      logger.error(COMPONENT, `Error handling listing: ${error} (message = ${message})`);
    }
  });

  // Collection bids
  client.on("CollectionBidsPrice", async (message: string) => {
    try {
      const parsedMessage: {
        contractAddress: string;
        updates: Sdk.Blur.Types.BlurBidPricePoint[];
      } = JSON.parse(message);

      const collection = parsedMessage.contractAddress.toLowerCase();
      const pricePoints = parsedMessage.updates;
      await blurBidsBufferJob.addToQueue(
        {
          collection,
        },
        pricePoints
      );
    } catch (error) {
      logger.error(COMPONENT, `Error handling bid: ${error} (message = ${message})`);
    }
  });

  // Collection Trait bids
  client.on("trait_bidLevels", async (message: string) => {
    try {
      const parsedMessage: {
        contractAddress: string;
        updates: Sdk.Blur.Types.BlurBidPriceTraitPoint[];
      } = JSON.parse(message);

      const collection = parsedMessage.contractAddress.toLowerCase();

      const traitUpdates = parsedMessage.updates.filter((d) => d.criteriaType === "TRAIT");
      const updatesGroupByAttribute: {
        [key: string]: Sdk.Blur.Types.BlurBidPriceTraitPoint[];
      } = {};

      // Flatten by single attribute
      _.each(traitUpdates, (update) => {
        const { criteriaValue } = update;
        Object.keys(criteriaValue).forEach((attributeKey) => {
          const attributeId = `${attributeKey}:${criteriaValue[attributeKey]}`;
          if (!updatesGroupByAttribute[attributeId]) updatesGroupByAttribute[attributeId] = [];
          updatesGroupByAttribute[attributeId].push(update);
        });
      });

      for (const attributeId of Object.keys(updatesGroupByAttribute)) {
        const [attributeKey, attributeValue] = attributeId.split(":");
        const pricePointsRaw = updatesGroupByAttribute[attributeId];
        const highestPricePoint = pricePointsRaw
          .filter((c) => c.executableSize > 0)
          .sort((a, b) => Number(b.price) - Number(a.price))[0];
        await blurBidsBufferJob.addToQueue(
          {
            collection,
            attributeKey,
            attributeValue,
          },
          [
            {
              price: highestPricePoint.price,
              executableSize: highestPricePoint.executableSize,
              bidderCount: highestPricePoint.bidderCount,
            },
          ]
        );
      }
    } catch (error) {
      logger.error(COMPONENT, `Error handling bid: ${error} (message = ${message})`);
    }
  });
}
