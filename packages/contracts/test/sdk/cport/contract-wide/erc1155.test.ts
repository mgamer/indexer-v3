import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as CPort from "@reservoir0x/sdk/src/cport";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../../utils";

describe("CPort - ContractWide ERC1155", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let erc1155: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol] = await ethers.getSigners();

    ({ erc1155 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and fill buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const feeRecipient = carol;

    const price = parseEther("1");
    const fee = 250;
    const soldTokenId = 100;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange for the buyer
    await weth.approve(buyer, CPort.Addresses.Exchange[chainId]);

    // Approve the exchange for the seller
    await weth.approve(seller, CPort.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, CPort.Addresses.Exchange[chainId]);

    const exchange = new CPort.Exchange(chainId);

    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new CPort.Builders.ContractWide(chainId);

    // Build buy order
    const buyOrder = builder.build({
      protocol: CPort.Types.OrderProtocols.ERC1155_FILL_OR_KILL,
      marketplace: constants.AddressZero,
      beneficiary: buyer.address,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      trader: buyer.address,
      tokenAddress: erc1155.address,
      amount: "1",
      price: price,
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      paymentMethod: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    });

    // Sign the order
    await buyOrder.sign(buyer);
    buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await weth.getBalance(seller.address);

    // Create matching sell order
    await exchange.fillOrder(seller, buyOrder, {
      tokenId: soldTokenId,
      taker: seller.address
    });

    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    const sellerNftBalanceAfter = await nft.getBalance(seller.address, soldTokenId);
    const buyerNftBalanceAfter = await nft.getBalance(buyer.address, soldTokenId);

    expect(receiveAmount).to.gte(price);  
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(1);
  });
});
