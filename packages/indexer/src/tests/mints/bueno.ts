import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { describe, expect, it, jest } from "@jest/globals";
import { Network } from "@reservoir0x/sdk/dist/utils";

import { config } from "../../config";
import { extractByTx } from "../../orderbook/mints/calldata/detector/bueno";
import type { Info } from "../../orderbook/mints/calldata/detector/bueno";
import * as utils from "@/events-sync/utils";

jest.setTimeout(60 * 1000);

if (config.chainId === Network.Ethereum) {
  describe("Mints - Bueno", () => {
    it("extracts by tx ERC721", async () => {
      const transactions = [
        "0xab8e2284250e65d26e20de268a7a8eb718d9e39dfd2df64df7426a4dbe395c87",
        "0x4aa7381c7ef4b090c85a73c0fbb4ad002be71869847ba172dd2a9c63ca598dad",
      ];

      for (const txHash of transactions) {
        const transaction = await utils.fetchTransaction(txHash);
        const results = await extractByTx(transaction.to, transaction);
        expect(results.length).not.toBe(0);
      }
    });

    it("extracts by tx ERC1155", async () => {
      const transactions = ["0x3418c9e158490638ddfb81288285c14cac443576585e46a39236400069d6dccf"];

      for (const txHash of transactions) {
        const transaction = await utils.fetchTransaction(txHash);
        const results = await extractByTx(transaction.to, transaction);
        expect(results.length).not.toBe(0);
      }
    });
  });
}
