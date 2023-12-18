import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { describe, expect, it, jest } from "@jest/globals";
import { Network } from "@reservoir0x/sdk/dist/utils";

import { config } from "../../config";
import {
  extractByCollectionERC721,
  extractByTx,
} from "../../orderbook/mints/calldata/detector/highlightxyz";
import * as utils from "@/events-sync/utils";

jest.setTimeout(60 * 1000);

if (config.chainId === Network.Ethereum) {
  describe("Mints - Highlight.xyz", () => {
    /*
    event EditionVectorCreated(uint256 indexed vectorId, uint48 indexed editionId, address indexed contractAddress);

    event SeriesVectorCreated(uint256 indexed vectorId, address indexed contractAddress);

    event VectorUpdated(uint256 indexed vectorId);

    event VectorDeleted(uint256 indexed vectorId);

    event DiscreteDutchAuctionCreated(bytes32 indexed mechanicVectorId);

    event MechanicVectorRegistered(
        bytes32 indexed mechanicVectorId,
        address indexed mechanic,
        address indexed contractAddress,
        uint256 editionId,
        bool isEditionBased
    );

    emit DiscreteDutchAuctionUpdated(mechanicVectorId);

*/

    it("detects possible mints vectorMint721 from vectorId", async () => {
      const collection = "0x97c8706bc109e97dc33554768f160e54c2936bd2";
      const results = await extractByCollectionERC721(collection, {
        vectorId: "35",
      });

      expect(results.length).not.toBe(0);
    });

    it("detects possible mints mechanicMintNum from vectorId", async () => {
      const collection = "0xc1739be27821fa207ba62a52d31b851013e2cb7f";
      const results = await extractByCollectionERC721(collection, {
        vectorId: "0xceb371ca95433c75d46ede1c5d99ac4f78c50bff15471c0549ea20d03371b432",
      });

      expect(results.length).not.toBe(0);
    });

    it("extract by tx", async () => {
      const data = [
        {
          collection: "0xc1739be27821fa207ba62a52d31b851013e2cb7f",
          txHash: "0xe0f2607a950aee1afdca679e78d40e5622290712aa290313fd6d4561510b3326",
        },
        {
          collection: "0xf5f710f8bec4114f134d16f4b4c560dbb5836548",
          txHash: "0x66a66cfe65529043856b0dfaddff93f7faa3f4f82715a422d798acc2335d3ad4",
        },
      ];

      for (const d of data) {
        const transaction = await utils.fetchTransaction(d.txHash);
        const results = await extractByTx(d.collection, transaction);
        expect(results.length).not.toBe(0);
      }
    });
  });
}
