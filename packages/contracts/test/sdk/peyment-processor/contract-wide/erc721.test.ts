import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as PaymentProcessor from "@reservoir0x/sdk/src/payment-processor";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";
import {
  getChainId,
  getCurrentTimestamp,
  reset,
  setupNFTs,
  setupTokens,
} from "../../../utils";
import { _TypedDataEncoder } from "@ethersproject/hash";

describe("PaymentProcessor - Contract-wide", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let ted: SignerWithAddress;
  let carol: SignerWithAddress;

  let erc20: Contract;
  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, ted, carol] = await ethers.getSigners();

    ({ erc20 } = await setupTokens(deployer));
    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and fill contract-wide buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer,PaymentProcessor.Addresses.PaymentProcessor[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessor.Addresses.PaymentProcessor[chainId]);

    const exchange = new PaymentProcessor.Exchange(chainId);

    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);
    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);

    const builder = new PaymentProcessor.Builders.ContractWide(chainId);
    const buyOrder = builder.build({
      protocol: 0,
      collectionLevelOffer: true,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      privateTaker: constants.AddressZero,
      trader: buyer.address,
      tokenAddress: erc721.address,
      amount: "1",
      price: price,
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      coin: Common.Addresses.Weth[chainId],
      masterNonce: buyerMasterNonce
    })

    const sellOrder = buyOrder.buildMatching({
      taker: seller.address,
      takerNonce: sellerMasterNonce,
      tokenId: soldTokenId
    })
 
    await buyOrder.sign(buyer);
    await sellOrder.sign(seller);

    buyOrder.checkSignature();
    sellOrder.checkSignature();

    buyOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await weth.getBalance(seller.address);

    await exchange.fillOrder(seller, buyOrder, sellOrder);

    const ownerAfter = await nft.getOwner(soldTokenId);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });
});