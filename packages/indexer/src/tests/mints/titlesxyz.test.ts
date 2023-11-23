import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { describe, expect, it, jest } from "@jest/globals";
import { Network } from "@reservoir0x/sdk/dist/utils";

import { config } from "../../config";
import * as TitlesXYZ from "../../orderbook/mints/calldata/detector/titlesxyz";

jest.setTimeout(60 * 1000);

if (config.chainId === Network.Zora) {
  describe("Mints - TitlesXYZ", () => {
    /*
      Network: ZORA

      Factory:
      emit EditionPublished({
        creator: msg.sender,
        remixContractAddress: remixClone,
        creatorProceedRecipient: proceedRecipient,
        derivativeFeeRecipient: feeRecipient
      });

      EditionsV1:
      function purchase(uint256 quantity) external payable;

      Non editable:
      function price() external view (uint256)
      function maxSupply() external view (uint256)
      function mintLimitPerWallet() external view (uint256)
      function saleEndTime() external view (uint256)
    */

    it("mint", async () => {
      const collection = "0xA279aF774A0dd6c88f4a330c9CC7dD7d22594454";
      const results = await TitlesXYZ.extractByCollectionERC721(collection);
      expect(results.length).not.toBe(0);
    });
  });
}
