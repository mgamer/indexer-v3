import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { baseProvider } from "@/common/provider";
import { logger } from "@/common/logger";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as ApprovalProxy from "@reservoir0x/sdk/src/router/v6/approval-proxy";

const version = "v1";

export const getExecuteTransferV1Options: RouteOptions = {
  description: "Batch Transfer NFTs To Another Wallet",
  tags: ["api", "Misc"],
  plugins: {
    "hapi-swagger": {
      order: 50,
    },
  },
  validate: {
    query: Joi.object({
      sender: Joi.string().required(),
      recipient: Joi.string().required(),
      collection: Joi.string().required(),
    }),
  },
  response: {
    schema: Joi.object({
      error: Joi.string(),
      txData: Joi.object(),
    }).label(`getExecuteTransfer${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-transfer-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;
    try {
      const router = new Sdk.RouterV6.Router(config.chainId, baseProvider, {
        cbApiKey: config.cbApiKey,
      });

      const collection = payload.collection;
      const transferDetails: ApprovalProxy.TransferItem[] = [];

      const exchange = new Sdk.SeaportV15.Exchange(config.chainId);
      const openSeaConduit = exchange.deriveConduit(
        Sdk.SeaportBase.Addresses.OpenseaConduitKey[config.chainId]
      );
      const reservoirConduit = exchange.deriveConduit(
        Sdk.SeaportBase.Addresses.ReservoirConduitKey[config.chainId]
      );

      const isOpenseaApproved = await commonHelpers.getNftApproval(
        collection,
        payload.sender,
        openSeaConduit
      );
      const isReservoirApproved = await commonHelpers.getNftApproval(
        collection,
        payload.sender,
        reservoirConduit
      );

      const contractKind = await commonHelpers.getContractKind(collection);
      const senderOwnedTokenIds = await commonHelpers.getNfts(collection, payload.sender);

      transferDetails.push({
        items: senderOwnedTokenIds.map((tokenId) => {
          return {
            itemType:
              contractKind === "erc721"
                ? ApprovalProxy.ItemType.ERC721
                : ApprovalProxy.ItemType.ERC1155,
            token: collection,
            amount: "1",
            identifier: tokenId.toString(),
          };
        }),
        recipient: payload.recipient,
      });

      if (!isOpenseaApproved || !isReservoirApproved) {
        return {
          error: "No avaiable options",
        };
      }

      const tx = await router.genTransferTx(
        transferDetails,
        payload.recipient,
        isOpenseaApproved ? "opensea" : "reservoir"
      );

      return {
        txData: tx,
      };
    } catch (error) {
      logger.error(`post-pre-signature-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
