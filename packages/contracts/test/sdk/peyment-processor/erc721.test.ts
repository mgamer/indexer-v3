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
} from "../../utils";
import { _TypedDataEncoder } from "@ethersproject/hash";

describe("PaymentProcessor", () => {
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
    const buyerMasterNonce = await exchange.getNonce(ethers.provider, buyer.address);

    const blockTime = await getCurrentTimestamp(ethers.provider);
    const listing = {
        protocol: 0,
        sellerAcceptedOffer: false,
        marketplace: constants.AddressZero,
        marketplaceFeeNumerator: "0",
        maxRoyaltyFeeNumerator: "0",
        privateBuyer: constants.AddressZero,
        seller: seller.address,
        tokenAddress: erc721.address,
        tokenId: soldTokenId,
        amount: "1",
        minPrice: price,
        expiration: (blockTime + 60 * 60).toString(),
        nonce: "0",
        coin: constants.AddressZero,
    }

    const matchedOrderListing: PaymentProcessor.Types.MatchOrder = {
        sellerAcceptedOffer: listing.sellerAcceptedOffer,
        collectionLevelOffer: false,
        protocol: listing.protocol,
        paymentCoin: listing.coin,
        tokenAddress: listing.tokenAddress,
        seller: listing.seller,
        privateBuyer: listing.privateBuyer,

        buyer: buyer.address,
        offerPrice: listing.minPrice,
        offerNonce: listing.nonce,

        delegatedPurchaser: constants.AddressZero,
        marketplace: listing.marketplace,
        marketplaceFeeNumerator: listing.marketplaceFeeNumerator,
        maxRoyaltyFeeNumerator: listing.maxRoyaltyFeeNumerator,

        listingNonce: listing.nonce,
        listingMinPrice: listing.minPrice,
        listingExpiration: listing.expiration,
        offerExpiration: listing.expiration,
        tokenId: listing.tokenId,
        amount: listing.amount,

        sellerMasterNonce: sellerMasterNonce,
        buyerMasterNonce: buyerMasterNonce
    }

    const order = new PaymentProcessor.Order(chainId, matchedOrderListing);
   
    await order.sign(seller);
    await order.signOffer(buyer);

    order.checkSignature();
    order.checkFillability(ethers.provider);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    await exchange.fillOrder(buyer, order);
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

    const sellerMasterNonce = await exchange.getNonce(ethers.provider, seller.address);
    const buyerMasterNonce = await exchange.getNonce(ethers.provider, buyer.address);

    const blockTime = await getCurrentTimestamp(ethers.provider);
    const listing = {
        protocol: 0,
        sellerAcceptedOffer: false,
        marketplace: constants.AddressZero,
        marketplaceFeeNumerator: "0",
        maxRoyaltyFeeNumerator: "0",
        privateBuyer: constants.AddressZero,
        seller: seller.address,
        tokenAddress: erc721.address,
        tokenId: soldTokenId,
        amount: "1",
        minPrice: price,
        expiration: (blockTime + 60 * 60).toString(),
        nonce: "0",
        coin: Common.Addresses.Weth[chainId],
    }

    const matchedOrderListing: PaymentProcessor.Types.MatchOrder = {
        sellerAcceptedOffer: listing.sellerAcceptedOffer,
        collectionLevelOffer: false,
        protocol: listing.protocol,
        paymentCoin: listing.coin,
        tokenAddress: listing.tokenAddress,
        seller: listing.seller,
        privateBuyer: listing.privateBuyer,

        buyer: buyer.address,
        offerPrice: listing.minPrice,
        offerNonce: listing.nonce,

        delegatedPurchaser: constants.AddressZero,
        marketplace: listing.marketplace,
        marketplaceFeeNumerator: listing.marketplaceFeeNumerator,
        maxRoyaltyFeeNumerator: listing.maxRoyaltyFeeNumerator,

        listingNonce: listing.nonce,
        listingMinPrice: listing.minPrice,
        listingExpiration: listing.expiration,
        offerExpiration: listing.expiration,
        tokenId: listing.tokenId,
        amount: listing.amount,

        sellerMasterNonce: sellerMasterNonce,
        buyerMasterNonce: buyerMasterNonce
    }

    const order = new PaymentProcessor.Order(chainId, matchedOrderListing);
   
    await order.sign(seller);
    await order.signOffer(buyer);

    order.checkSignature();
    order.checkFillability(ethers.provider);
    const sellerBalanceBefore = await weth.getBalance(seller.address);

    await exchange.fillOrder(seller, order);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

});