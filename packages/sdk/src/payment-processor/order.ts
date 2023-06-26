import * as Types from "./types";
import { lc, s, n, bn } from "../utils";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { verifyTypedData } from "@ethersproject/wallet";
import { Provider } from "@ethersproject/abstract-provider";
import { Contract } from "@ethersproject/contracts";
import { AddressZero, HashZero } from "@ethersproject/constants";
import ExchangeAbi from "./abis/PaymentProcessor.json";
import * as Addresses from "./addresses";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import * as Common from "../common";
import { Builders } from "./builders";
import { BaseBuilder, MatchingOptions } from "./builders/base";
import { splitSignature } from "@ethersproject/bytes";

export class Order {
  public chainId: number;
  public params: Types.BaseOrder;

  constructor(chainId: number, params: Types.BaseOrder) {
    this.chainId = chainId;
    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }

    // Detect kind
    if (!params.kind) {
      this.params.kind = this.detectKind();
    }
  }

  public hash() {
    const [types, value, structName] = this.getEip712TypesAndValue();
    return _TypedDataEncoder.hashStruct(structName, types, value);
  }

  public isBuyOrder() {
    return ["offer-approval", "collection-offer-approval"].includes(this.params.kind!);
  }

  public checkValidity() {
    if (!this.getBuilder().isValid(this)) {
      throw new Error("Invalid order");
    }
  }

  private detectKind(): Types.OrderKind {
    if (this.params.tokenId != undefined && this.params.sellerAcceptedOffer != undefined) {
      return "sale-approval";
    }

    if (this.params.collectionLevelOffer != undefined) {
      return "collection-offer-approval";
    }

    if (
      this.params.collectionLevelOffer == undefined &&
      this.params.sellerAcceptedOffer == undefined
    ) {
      return "offer-approval";
    }

    throw new Error("Could not detect order kind (order might have unsupported params/calldata)");
  }

  public async sign(signer: TypedDataSigner) {
    const [types, value] = this.getEip712TypesAndValue();
    const signature = await signer._signTypedData(EIP712_DOMAIN(this.chainId), types, value);
    const { r, s, v } = splitSignature(signature);
    this.params = {
      ...this.params,
      r,
      s,
      v,
    };
  }

  public getSignatureData() {
    const [types, value] = this.getEip712TypesAndValue();
    return {
      signatureKind: "eip712",
      domain: EIP712_DOMAIN(this.chainId),
      types,
      value,
      primaryType: _TypedDataEncoder.getPrimaryType(types),
    };
  }

  public getMatchedOrder(matchOrder: Order): Types.MatchedOrder {
    const isBuyOrder = this.isBuyOrder();

    const sellOrder = isBuyOrder ? matchOrder.params : this.params;
    const buyOrder = isBuyOrder ? this.params : matchOrder.params;
    return {
      sellerAcceptedOffer: sellOrder.sellerAcceptedOffer ?? false,
      collectionLevelOffer: buyOrder.collectionLevelOffer ?? false,

      protocol: sellOrder.protocol,
      paymentCoin: sellOrder.coin,
      tokenAddress: sellOrder.tokenAddress,

      seller: sellOrder.trader,
      privateBuyer: sellOrder.privateTaker,

      buyer: buyOrder.trader,
      delegatedPurchaser: buyOrder.privateTaker,

      marketplace: sellOrder.marketplace,
      marketplaceFeeNumerator: sellOrder.marketplaceFeeNumerator,
      maxRoyaltyFeeNumerator: sellOrder.maxRoyaltyFeeNumerator ?? "0",

      listingNonce: sellOrder.nonce,
      listingMinPrice: sellOrder.price,
      listingExpiration: sellOrder.expiration,

      offerNonce: buyOrder.nonce,
      offerPrice: buyOrder.price,
      offerExpiration: buyOrder.expiration,

      tokenId: sellOrder.tokenId ?? "0",
      amount: sellOrder.amount,

      sellerMasterNonce: sellOrder.masterNonce,
      buyerMasterNonce: buyOrder.masterNonce,
      listingSignature: {
        r: sellOrder.r!,
        s: sellOrder.s!,
        v: sellOrder.v!,
      },
      offerSignature: {
        r: buyOrder.r!,
        s: buyOrder.s!,
        v: buyOrder.v!,
      },
    };
  }

  public checkSignature() {
    const signature = {
      r: this.params.r!,
      s: this.params.s!,
      v: this.params.v!,
    };

    const listing = this.getEip712TypesAndValue();
    const recoverSinger = verifyTypedData(
      EIP712_DOMAIN(this.chainId),
      listing[0],
      listing[1],
      signature
    );

    if (lc(this.params.trader) !== lc(recoverSinger)) {
      throw new Error("Invalid listing signature");
    }
  }

  public async checkFillability(provider: Provider) {
    const chainId = await provider.getNetwork().then((n) => n.chainId);
    const exchange = new Contract(Addresses.PaymentProcessor[this.chainId], ExchangeAbi, provider);

    const [buyerMasterNonce] = await Promise.all([exchange.masterNonces(this.params.trader)]);

    if (buyerMasterNonce.gt(this.params.nonce)) {
      throw new Error("cancelled");
    }

    if (!this.isBuyOrder()) {
      if (this.params.protocol === Types.TokenProtocols.ERC721 && this.params.tokenId) {
        const erc721 = new Common.Helpers.Erc721(provider, this.params.tokenAddress);
        // Check ownership
        const owner = await erc721.getOwner(this.params.tokenId);
        if (lc(owner) !== lc(this.params.trader)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc721.isApproved(
          this.params.trader,
          Addresses.PaymentProcessor[this.chainId]
        );
        if (!isApproved) {
          throw new Error("no-approval");
        }
      } else if (this.params.protocol === Types.TokenProtocols.ERC1155 && this.params.tokenId) {
        const erc1155 = new Common.Helpers.Erc1155(provider, this.params.tokenAddress);
        // Check balance
        const balance = await erc1155.getBalance(this.params.trader, this.params.tokenId);
        if (bn(balance).lt(1)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc1155.isApproved(
          this.params.trader,
          Addresses.PaymentProcessor[this.chainId]
        );
        if (!isApproved) {
          throw new Error("no-approval");
        }
      } else {
        throw new Error("invalid");
      }
    } else {
      if (this.params.coin != AddressZero) {
        // Check that maker has enough balance to cover the payment
        // and the approval to the token transfer proxy is set
        const erc20 = new Common.Helpers.Erc20(provider, this.params.coin);
        const balance = await erc20.getBalance(this.params.trader);
        if (bn(balance).lt(this.params.price)) {
          throw new Error("no-balance");
        }

        // Check allowance
        const allowance = await erc20.getAllowance(
          this.params.trader,
          Addresses.PaymentProcessor[chainId]
        );
        if (bn(allowance).lt(this.params.price)) {
          throw new Error("no-approval");
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getEip712TypesAndValue(): any {
    if (this.params.kind === "sale-approval") {
      const listing: Types.SaleApproval = {
        protocol: this.params.protocol,
        sellerAcceptedOffer: this.params.sellerAcceptedOffer!,
        marketplace: this.params.marketplace,
        marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
        maxRoyaltyFeeNumerator: this.params.maxRoyaltyFeeNumerator!,
        privateBuyer: this.params.privateTaker,
        seller: this.params.trader!,
        tokenAddress: this.params.tokenAddress,
        tokenId: this.params.tokenId!,
        amount: this.params.amount,
        minPrice: this.params.price!,
        expiration: this.params.expiration,
        nonce: this.params.nonce,
        masterNonce: this.params.masterNonce,
        coin: this.params.coin,
      };
      return [EIP712_SALE_APPROVAL_TYPES, listing, "SaleApproval"];
    } else if (this.params.kind === "offer-approval") {
      const offer: Types.OfferApproval = {
        protocol: this.params.protocol,
        marketplace: this.params.marketplace,
        marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,

        delegatedPurchaser: this.params.privateTaker,
        buyer: this.params.trader,
        tokenAddress: this.params.tokenAddress,
        tokenId: this.params.tokenId!,
        amount: this.params.amount,

        price: this.params.price!,
        expiration: this.params.expiration!,
        nonce: this.params.nonce!,
        masterNonce: this.params.masterNonce,
        coin: this.params.coin,
      };
      return [EIP712_OFFER_APPROVAL_TYPES, offer, "OfferApproval"];
    } else if (this.params.kind === "collection-offer-approval") {
      const collectionOffer: Types.CollectionOfferApproval = {
        protocol: this.params.protocol,
        marketplace: this.params.marketplace,
        collectionLevelOffer: this.params.collectionLevelOffer!,
        marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
        delegatedPurchaser: this.params.privateTaker,
        buyer: this.params.trader,
        tokenAddress: this.params.tokenAddress,
        amount: this.params.amount,
        price: this.params.price!,
        expiration: this.params.expiration!,
        nonce: this.params.nonce!,
        masterNonce: this.params.masterNonce,
        coin: this.params.coin,
      };
      return [EIP712_COLLECTION_OFFER_APPROVAL_TYPES, collectionOffer, "CollectionOfferApproval"];
    }
  }

  private getBuilder(): BaseBuilder {
    switch (this.params.kind) {
      case "collection-offer-approval": {
        return new Builders.ContractWide(this.chainId);
      }

      case "offer-approval":
      case "sale-approval": {
        return new Builders.SingleToken(this.chainId);
      }

      default: {
        throw new Error("Unknown order kind");
      }
    }
  }

  public buildMatching(options: MatchingOptions) {
    return this.getBuilder().buildMatching(this, options);
  }
}

export const EIP712_SALE_APPROVAL_TYPES = {
  SaleApproval: [
    { name: "protocol", type: "uint8" },
    { name: "sellerAcceptedOffer", type: "bool" },
    { name: "marketplace", type: "address" },
    { name: "marketplaceFeeNumerator", type: "uint256" },
    { name: "maxRoyaltyFeeNumerator", type: "uint256" },
    { name: "privateBuyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "tokenAddress", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "minPrice", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "masterNonce", type: "uint256" },
    { name: "coin", type: "address" },
  ],
};

export const EIP712_OFFER_APPROVAL_TYPES = {
  OfferApproval: [
    { name: "protocol", type: "uint8" },
    { name: "marketplace", type: "address" },
    { name: "marketplaceFeeNumerator", type: "uint256" },
    { name: "delegatedPurchaser", type: "address" },
    { name: "buyer", type: "address" },
    { name: "tokenAddress", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "price", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "masterNonce", type: "uint256" },
    { name: "coin", type: "address" },
  ],
};

export const EIP712_COLLECTION_OFFER_APPROVAL_TYPES = {
  CollectionOfferApproval: [
    { name: "protocol", type: "uint8" },
    { name: "collectionLevelOffer", type: "bool" },
    { name: "marketplace", type: "address" },
    { name: "marketplaceFeeNumerator", type: "uint256" },
    { name: "delegatedPurchaser", type: "address" },
    { name: "buyer", type: "address" },
    { name: "tokenAddress", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "price", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "masterNonce", type: "uint256" },
    { name: "coin", type: "address" },
  ],
};

export const EIP712_DOMAIN = (chainId: number) => ({
  name: "PaymentProcessor",
  version: "1",
  chainId,
  verifyingContract: Addresses.PaymentProcessor[chainId],
});

const normalize = (order: Types.BaseOrder): Types.BaseOrder => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings
  return {
    kind: order.kind,
    sellerAcceptedOffer: order.sellerAcceptedOffer,
    collectionLevelOffer: order.collectionLevelOffer ?? undefined,
    protocol: n(order.protocol),
    coin: lc(order.coin),
    tokenAddress: lc(order.tokenAddress),
    privateTaker: order.privateTaker ? lc(order.privateTaker) : AddressZero,
    trader: lc(order.trader),
    marketplace: lc(order.marketplace),
    marketplaceFeeNumerator: s(order.marketplaceFeeNumerator),
    maxRoyaltyFeeNumerator: order.maxRoyaltyFeeNumerator
      ? s(order.maxRoyaltyFeeNumerator)
      : undefined,
    nonce: s(order.nonce),
    price: s(order.price),
    expiration: s(order.expiration),
    tokenId: order.tokenId ? s(order.tokenId) : undefined,
    amount: s(order.amount),
    masterNonce: s(order.masterNonce),
    v: order.v ?? 0,
    r: order.r ?? HashZero,
    s: order.s ?? HashZero,
  };
};
