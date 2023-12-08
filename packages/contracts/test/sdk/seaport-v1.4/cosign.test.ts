import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as SeaportV14 from "@reservoir0x/sdk/src/seaport-v1.4";
import { Builders } from "@reservoir0x/sdk/src/seaport-base";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";

import { getChainId, getCurrentTimestamp, reset, setupZones, setupNFTs, setupTokens } from "../../utils";

describe("SeaportV14- SingleToken Erc721 - Cosign", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let ted: SignerWithAddress;
  let carol: SignerWithAddress;

  let erc20: Contract;
  let erc721: Contract;
  let zone: string;
  let signedZoneController: string;
  let signer: SignerWithAddress;

  beforeEach(async () => {
    [deployer, alice, bob, ted, carol] = await ethers.getSigners();
    ({ erc20 } = await setupTokens(deployer));
    ({ erc721 } = await setupNFTs(deployer));
    ({
        zone,
        signedZoneController,
        signer
    } = await setupZones(chainId, deployer));
  });

  afterEach(reset);

  it("Build and fill sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV14.Addresses.Exchange[chainId]);
    // SeaportBase.Addresses.ReservoirCancellationZone[chainId] = zone;

    const exchange = new SeaportV14.Exchange(chainId);

    const builder = new Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build(
      {
        side: "sell",
        tokenKind: "erc721",
        offerer: seller.address,
        contract: erc721.address,
        tokenId: soldTokenId,
        paymentToken: Common.Addresses.Native[chainId],
        price,
        counter: 0,
        zone: zone,
        zoneHash: constants.HashZero,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      },
      SeaportV14.Order
    );
    
    // Sign the order
    await sellOrder.sign(seller);
    await sellOrder.checkFillability(ethers.provider);

    // Cosign
    await sellOrder.cosign(signer, {
        amount: 1
    });

    // Create matching params
    const matchParams = sellOrder.buildMatching();

    const buyerEthBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerEthBalanceBefore = await ethers.provider.getBalance(seller.address);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, matchParams, {
      source: "reservoir.market",
    });

    const buyerEthBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerEthBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.be.gt(price);
    expect(sellerEthBalanceAfter).to.eq(sellerEthBalanceBefore.add(price));
    expect(ownerAfter).to.eq(buyer.address);
  });
});
