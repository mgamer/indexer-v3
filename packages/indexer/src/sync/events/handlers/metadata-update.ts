import { bn } from "@/common/utils";
import { getEventData } from "@/events-sync/data";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import _ from "lodash";

export const handleEvents = async (events: EnhancedEvent[]) => {
  // Handle the events
  for (const { subKind, baseEventParams, log } of events) {
    const eventData = getEventData([subKind])[0];
    switch (subKind) {
      case "metadata-update-single-token": {
        const parsedLog = eventData.abi.parseLog(log);
        const tokenId = parsedLog.args["tokenId"].toString();

        // trigger a refresh for token of tokenId and baseEventParams.address
        await metadataIndexFetchJob.addToQueue(
          [
            {
              kind: "single-token",
              data: {
                method: metadataIndexFetchJob.getIndexingMethod(baseEventParams.address || null),
                collection: baseEventParams.address.toLowerCase(),
                contract: baseEventParams.address.toLowerCase(),
                tokenId: tokenId,
              },
              context: "onchain-metadata-update-single-token",
            },
          ],
          true,
          15
        );
        break;
      }

      case "metadata-update-batch-tokens": {
        const parsedLog = eventData.abi.parseLog(log);
        const fromToken = parsedLog.args["_fromTokenId"].toString();
        const toToken = parsedLog.args["_toTokenId"].toString();

        // if _toToken = type(uint256).max, then this is just a collection refresh

        if (toToken === bn(2).pow(256).sub(1).toString()) {
          // trigger a refresh for all tokens of baseEventParams.address
          await metadataIndexFetchJob.addToQueue(
            [
              {
                kind: "full-collection",
                data: {
                  method: metadataIndexFetchJob.getIndexingMethod(baseEventParams.address),
                  collection: baseEventParams.address.toLowerCase(),
                },
                context: "onchain-metadata-update-batch-tokens",
              },
            ],
            true,
            15
          );
        } else {
          // trigger a refresh for all tokens  fromToken to toToken of baseEventParams.address
          await metadataIndexFetchJob.addToQueue(
            _.range(parseInt(fromToken), parseInt(toToken) + 1).map((tokenId) => ({
              kind: "single-token",
              data: {
                method: metadataIndexFetchJob.getIndexingMethod(baseEventParams.address),
                collection: baseEventParams.address.toLowerCase(),
                contract: baseEventParams.address.toLowerCase(),
                tokenId: tokenId.toString(),
              },
              context: "onchain-metadata-update-batch-tokens",
            })),
            true,
            15
          );
        }

        break;
      }

      case "metadata-update-uri": {
        await metadataIndexFetchJob.addToQueue(
          [
            {
              kind: "full-collection",
              data: {
                method: metadataIndexFetchJob.getIndexingMethod(baseEventParams.address),
                collection: baseEventParams.address.toLowerCase(),
              },
              context: "onchain-metadata-update-batch-tokens",
            },
          ],
          true,
          15
        );

        break;
      }
    }
  }
};
