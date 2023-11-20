import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { describe, expect, it, jest } from "@jest/globals";
import { Network } from "@reservoir0x/sdk/dist/utils";

import { config } from "../../config";
import * as ArtBlocks from "../../orderbook/mints/calldata/detector/artblocks";

jest.setTimeout(60 * 1000);

if (config.chainId === Network.Ethereum) {
  describe("Mints - ArtBlocks", () => {
    it("public-sale", async () => {
      // Flow of project creation / mints:
      // User -> MinterTypedContract -> MinterFilter -> CollectionContract

      // Project is created on CollectionContract
      // event is ProjectUpdated(projectId, FIELD_PROJECT_CREATED);

      // Project is activated / deactivate on the CollecitonContract
      // event is ProjectUpdated(projectId, FIELD_PROJECT_ACTIVE);

      // Project minting is paused / unpaused on the CollectionContract
      // event is ProjectUpdated(_projectId, FIELD_PROJECT_PAUSED);

      // Project Minter is set on MinterFilter
      // event is ProjectMinterRegistered(_projectId, _minterAddress, IFilteredMinterV0(_minterAddress).minterType());

      // Project Minter is removed on MinterFilter
      // event is ProjectMinterRemoved(_projectId);

      // Project price is configured on MinterTypedContract

      // MinterSetPriceV4 0x234b25288011081817b5cc199c3754269ccb76d2
      // When price is changed, event is  PricePerTokenInWeiUpdated(_projectId, _pricePerTokenInWei);

      // whenever we have an event to:
      // - create a project
      // - set the minter for a projectId
      // - activate / deactivate projectId
      // - pause / unpause projectId
      // - set price for projectId
      // THEN
      // - call extractByCollectionERC721(collection, projectId, {
      //    minterContractAddress? // the address of the minter contract, if known
      //  })

      // old minter contract: 0x0e8bd86663e3c2418900178e96e14c51b2859957
      // MinterDAExpSettlementV1 0xfdE58c821D1c226b4a45c22904de20b114EDe7E7

      // const artblocksv0 = '0x059edd72cd353df5106d2b9cc5ab83a52287ac3a';
      // const artblocksv1 = '0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270';

      const artblocksCurated = "0x99a9b7c1116f9ceeb1652de04d5969cce509b069";

      // should be able to get minter
      const info = await ArtBlocks.extractByCollectionERC721(artblocksCurated, { projectId: 484 });
      expect(info.length).not.toBe(0);
    });

    // it("allowlist-sale", async () => {
    //   const collection = "0x738541f5ed9bc7ac8943df55709d5002693b43e3";
    //   const info = await ArtBlocks.extractByCollectionERC721(collection);
    //   expect(info.length).not.toBe(0);
    // });
  });
}
