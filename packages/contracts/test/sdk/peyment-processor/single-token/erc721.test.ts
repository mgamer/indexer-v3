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

describe("PaymentProcessor - SingleToken", () => {
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

  it("Build and fill sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessor.Addresses.PaymentProcessor[chainId]);

    const exchange = new PaymentProcessor.Exchange(chainId);

    const sellerMasterNonce = await exchange.getNonce(ethers.provider, seller.address);
    const takerMasterNonce = await exchange.getNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessor.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: 0,
      sellerAcceptedOffer: false,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      privateTaker: constants.AddressZero,
      trader: seller.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId,
      amount: "1",
      price: price,
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      coin: constants.AddressZero,
      masterNonce: sellerMasterNonce
    };

    // Build buy order
    const sellOrder = builder.build(orderParameters);
    await sellOrder.sign(seller);

    const buyOrder = sellOrder.buildMatching({
      taker: buyer.address,
      takerNonce: takerMasterNonce
    });

    await buyOrder.sign(buyer);

    buyOrder.checkSignature();
    sellOrder.checkSignature();

    buyOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    await exchange.fillOrder(buyer, sellOrder, buyOrder);

    const ownerAfter = await nft.getOwner(soldTokenId);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill buy order", async () => {
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
    const buyerMasterNonce = await exchange.getNonce(ethers.provider, buyer.address);
    const sellerMasterNonce = await exchange.getNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessor.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: 0,
      // sellerAcceptedOffer: false,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      privateTaker: constants.AddressZero,
      trader: buyer.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId,
      amount: "1",
      price: price,
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      coin: Common.Addresses.Weth[chainId],
      masterNonce: buyerMasterNonce
    };
  
    const buyOrder = builder.build(orderParameters);
    
    const sellOrder = buyOrder.buildMatching({
      taker: seller.address,
      takerNonce: sellerMasterNonce
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