import { Provider } from "@ethersproject/abstract-provider";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { splitSignature } from "@ethersproject/bytes";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { verifyTypedData } from "@ethersproject/wallet";

import * as Addresses from "./addresses";
import { Builders } from "./builders";
import { BaseBuilder, MatchingOptions } from "./builders/base";
import * as Types from "./types";
import * as Common from "../common";
import { lc, s, n, bn } from "../utils";
import ExchangeAbi from "./abis/cPort.json";

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
    return ["item-offer-approval", "collection-offer-approval", "tokenset-offer-approval"].includes(
      this.params.kind!
    );
  }

  public checkValidity() {
    if (!this.getBuilder().isValid(this)) {
      throw new Error("Invalid order");
    }
  }

  private detectKind(): Types.OrderKind {
    const params = this.params;
    if (params.maxRoyaltyFeeNumerator && !params.beneficiary) {
      return "sale-approval";
    }

    if (params.beneficiary && !params.maxRoyaltyFeeNumerator && params.tokenId) {
      return "item-offer-approval";
    }

    if (this.params.beneficiary && !this.params.maxRoyaltyFeeNumerator && !params.tokenId) {
      return "collection-offer-approval";
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

  public getMatchedOrder(
    taker: string
    // matchOrder: Order
  ): Types.MatchedOrder {
    const isBuyOrder = this.isBuyOrder();
    const sellOrder = this.params;
    // const buyOrder = isBuyOrder ? this.params : matchOrder.params;
    return {
      protocol: sellOrder.protocol,
      beneficiary: isBuyOrder ? sellOrder.beneficiary! : taker,
      marketplace: sellOrder.marketplace,
      paymentMethod: sellOrder.paymentMethod,
      tokenAddress: sellOrder.tokenAddress,
      maker: sellOrder.sellerOrBuyer,
      tokenId: sellOrder.tokenId ?? "0",
      amount: sellOrder.amount,
      itemPrice: sellOrder.price,
      nonce: sellOrder.nonce,
      expiration: sellOrder.expiration,

      marketplaceFeeNumerator: sellOrder.marketplaceFeeNumerator,
      maxRoyaltyFeeNumerator: sellOrder.maxRoyaltyFeeNumerator ?? "0",
      requestedFillAmount: "0",
      minimumFillAmount: "0",

      signature: {
        r: this.params.r!,
        s: this.params.s!,
        v: this.params.v!,
      },
    };
  }

  // public getSweepMatchedOrder(orders: Order[]): Types.SweepMatchedOrder {
  //   const matchedOrderBundleBase: Types.MatchedOrderBundleBase = {
  //     protocol: this.params.protocol,
  //     paymentCoin: this.params.coin,
  //     tokenAddress: this.params.tokenAddress,
  //     privateBuyer: AddressZero,
  //     buyer: this.params.sellerOrBuyer,
  //     delegatedPurchaser: AddressZero,
  //     marketplace: this.params.marketplace,
  //     marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
  //     offerNonce: this.params.nonce,
  //     offerPrice: this.params.price,
  //     offerExpiration: this.params.expiration,
  //   };

  //   return {
  //     bundleDetails: matchedOrderBundleBase,
  //     signedOffer: {
  //       r: this.params.r!,
  //       s: this.params.s!,
  //       v: this.params.v!,
  //     },
  //     signedListings: orders.map((c) => ({
  //       r: c.params.r!,
  //       s: c.params.s!,
  //       v: c.params.v!,
  //     })),
  //     bundleItems: orders.map((c) => ({
  //       tokenId: c.params.tokenId!,
  //       amount: c.params.amount,
  //       maxRoyaltyFeeNumerator: c.params.maxRoyaltyFeeNumerator,
  //       itemPrice: c.params.price,
  //       listingNonce: c.params.nonce,
  //       listingExpiration: c.params.expiration,
  //       seller: c.params.sellerOrBuyer,
  //     })),
  //   };
  // }

  public checkSignature() {
    const signature = {
      r: this.params.r!,
      s: this.params.s!,
      v: this.params.v!,
    };

    const [types, value] = this.getEip712TypesAndValue();
    const recoverSinger = verifyTypedData(EIP712_DOMAIN(this.chainId), types, value, signature);

    if (lc(this.params.sellerOrBuyer) !== lc(recoverSinger)) {
      throw new Error("Invalid listing signature");
    }
  }

  public async checkFillability(provider: Provider) {
    const chainId = await provider.getNetwork().then((n) => n.chainId);
    const exchange = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi, provider);

    const traderMasterNonce = await exchange.masterNonces(this.params.sellerOrBuyer);
    if (traderMasterNonce.gt(this.params.nonce)) {
      throw new Error("cancelled");
    }

    if (!this.isBuyOrder()) {
      if (this.params.protocol === Types.OrderProtocols.ERC721_FILL_OR_KILL) {
        const erc721 = new Common.Helpers.Erc721(provider, this.params.tokenAddress);
        // Check ownership
        const owner = await erc721.getOwner(this.params.tokenId!);
        if (lc(owner) !== lc(this.params.sellerOrBuyer)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc721.isApproved(
          this.params.sellerOrBuyer,
          Addresses.Exchange[this.chainId]
        );
        if (!isApproved) {
          throw new Error("no-approval");
        }
      } else if (
        [
          Types.OrderProtocols.ERC1155_FILL_OR_KILL,
          Types.OrderProtocols.ERC1155_FILL_PARTIAL,
        ].includes(this.params.protocol)
      ) {
        const erc1155 = new Common.Helpers.Erc1155(provider, this.params.tokenAddress);
        // Check balance
        const balance = await erc1155.getBalance(this.params.sellerOrBuyer, this.params.tokenId!);
        if (bn(balance).lt(this.params.amount)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc1155.isApproved(
          this.params.sellerOrBuyer,
          Addresses.Exchange[this.chainId]
        );
        if (!isApproved) {
          throw new Error("no-approval");
        }
      }
    } else {
      const totalPrice = this.params.price;

      // Check that maker has enough balance to cover the payment
      // and the approval to the token transfer proxy is set
      const erc20 = new Common.Helpers.Erc20(provider, this.params.paymentMethod);
      const balance = await erc20.getBalance(this.params.sellerOrBuyer);
      if (bn(balance).lt(totalPrice)) {
        throw new Error("no-balance");
      }

      // Check allowance
      const allowance = await erc20.getAllowance(
        this.params.sellerOrBuyer,
        Addresses.Exchange[chainId]
      );
      if (bn(allowance).lt(totalPrice)) {
        throw new Error("no-approval");
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getEip712TypesAndValue(): any {
    if (this.params.kind === "sale-approval") {
      const listing: Types.SaleApproval = {
        protocol: this.params.protocol,
        seller: this.params.sellerOrBuyer,
        marketplace: this.params.marketplace,
        paymentMethod: this.params.paymentMethod,
        tokenAddress: this.params.tokenAddress,
        tokenId: this.params.tokenId!,
        amount: this.params.amount,
        itemPrice: this.params.price,
        expiration: this.params.expiration,
        marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
        maxRoyaltyFeeNumerator: this.params.maxRoyaltyFeeNumerator!,
        nonce: this.params.nonce,
        masterNonce: this.params.masterNonce,
      };
      return [EIP712_SALE_APPROVAL_TYPES, listing, "SaleApproval"];
    } else if (this.params.kind === "item-offer-approval") {
      const offer: Types.ItemOfferApproval = {
        protocol: this.params.protocol,
        buyer: this.params.sellerOrBuyer,
        beneficiary: this.params.beneficiary!,
        marketplace: this.params.marketplace,
        paymentMethod: this.params.paymentMethod,
        tokenAddress: this.params.tokenAddress,
        tokenId: this.params.tokenId!,
        amount: this.params.amount,
        itemPrice: this.params.price,
        expiration: this.params.expiration,
        marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
        nonce: this.params.nonce,
        masterNonce: this.params.masterNonce,
      };
      return [EIP712_ITEM_OFFER_APPROVAL_TYPES, offer, "ItemOfferApproval"];
    } else if (this.params.kind === "collection-offer-approval") {
      const collectionOffer: Types.CollectionOfferApproval = {
        protocol: this.params.protocol,
        buyer: this.params.sellerOrBuyer,
        beneficiary: this.params.beneficiary!,
        marketplace: this.params.marketplace,
        paymentMethod: this.params.paymentMethod,
        tokenAddress: this.params.tokenAddress,
        amount: this.params.amount,
        itemPrice: this.params.price,
        expiration: this.params.expiration,
        marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
        nonce: this.params.nonce,
        masterNonce: this.params.masterNonce,
      };
      return [EIP712_COLLECTION_OFFER_APPROVAL_TYPES, collectionOffer, "CollectionOfferApproval"];
    } else if (this.params.kind === "tokenset-offer-approval") {
      const bundleOffer: Types.TokenSetOfferApproval = {
        protocol: this.params.protocol,
        buyer: this.params.sellerOrBuyer,
        beneficiary: this.params.beneficiary!,
        marketplace: this.params.marketplace,
        paymentMethod: this.params.paymentMethod,
        tokenAddress: this.params.tokenAddress,
        amount: this.params.amount,
        itemPrice: this.params.price,
        expiration: this.params.expiration,
        marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
        nonce: this.params.nonce,
        masterNonce: this.params.masterNonce,
        tokenSetMerkleRoot: this.params.tokenSetMerkleRoot!,
      };
      return [EIP712_TOKEN_SET_OFFER_APPROVAL_TYPES, bundleOffer, "TokenSetOfferApproval"];
    }
  }

  // static createBundledOfferOrder(
  //   orders: Order[],
  //   options: {
  //     taker: string;
  //     takerMasterNonce: BigNumberish;
  //     maxRoyaltyFeeNumerator?: BigNumberish;
  //   }
  // ) {
  //   const order = orders[0];
  //   const orderParams = order.params;
  //   return new Order(order.chainId, {
  //     kind: "bundled-offer-approval",
  //     protocol: orderParams.protocol,
  //     collectionLevelOffer: false,
  //     sellerAcceptedOffer: false,
  //     marketplace: orderParams.marketplace,
  //     marketplaceFeeNumerator: orderParams.marketplaceFeeNumerator,
  //     maxRoyaltyFeeNumerator: options?.maxRoyaltyFeeNumerator?.toString() ?? "0",
  //     privateBuyerOrDelegatedPurchaser: AddressZero,
  //     sellerOrBuyer: options.taker,
  //     tokenAddress: orderParams.tokenAddress,
  //     amount: orderParams.amount,
  //     price: orders.reduce((all, order) => all.add(order.params.price), bn(0)).toString(),
  //     expiration: orderParams.expiration,
  //     nonce: orderParams.nonce,
  //     coin: orderParams.coin,
  //     masterNonce: s(options.takerMasterNonce),

  //     tokenIds: orders.map((c) => c.params.tokenId!),
  //     amounts: orders.map((c) => c.params.amount),
  //     itemSalePrices: orders.map((c) => c.params.price),
  //   });
  // }

  private getBuilder(): BaseBuilder {
    switch (this.params.kind) {
      case "collection-offer-approval": {
        return new Builders.ContractWide(this.chainId);
      }

      case "item-offer-approval":
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
    { name: "seller", type: "address" },
    { name: "marketplace", type: "address" },
    { name: "paymentMethod", type: "address" },
    { name: "tokenAddress", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "itemPrice", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "marketplaceFeeNumerator", type: "uint256" },
    { name: "maxRoyaltyFeeNumerator", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "masterNonce", type: "uint256" },
  ],
};

export const EIP712_ITEM_OFFER_APPROVAL_TYPES = {
  ItemOfferApproval: [
    { name: "protocol", type: "uint8" },
    { name: "buyer", type: "address" },
    { name: "beneficiary", type: "address" },
    { name: "marketplace", type: "address" },
    { name: "paymentMethod", type: "address" },
    { name: "tokenAddress", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "itemPrice", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "marketplaceFeeNumerator", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "masterNonce", type: "uint256" },
  ],
};

export const EIP712_COLLECTION_OFFER_APPROVAL_TYPES = {
  CollectionOfferApproval: [
    { name: "protocol", type: "uint8" },
    { name: "buyer", type: "address" },
    { name: "beneficiary", type: "address" },
    { name: "marketplace", type: "address" },
    { name: "paymentMethod", type: "address" },
    { name: "tokenAddress", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "itemPrice", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "marketplaceFeeNumerator", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "masterNonce", type: "uint256" },
  ],
};

export const EIP712_TOKEN_SET_OFFER_APPROVAL_TYPES = {
  TokenSetOfferApproval: [
    { name: "protocol", type: "uint8" },
    { name: "buyer", type: "address" },
    { name: "beneficiary", type: "address" },
    { name: "marketplace", type: "address" },
    { name: "paymentMethod", type: "address" },
    { name: "tokenAddress", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "itemPrice", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "marketplaceFeeNumerator", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "masterNonce", type: "uint256" },
    { name: "tokenSetMerkleRoot", type: "bytes32" },
  ],
};

export const EIP712_DOMAIN = (chainId: number) => ({
  name: "cPort",
  version: "1",
  chainId,
  verifyingContract: Addresses.Exchange[chainId],
});

const normalize = (order: Types.BaseOrder): Types.BaseOrder => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings
  return {
    kind: order.kind,

    protocol: n(order.protocol),
    marketplace: lc(order.marketplace),
    marketplaceFeeNumerator: s(order.marketplaceFeeNumerator),
    tokenAddress: lc(order.tokenAddress),
    tokenId: order.tokenId !== undefined ? s(order.tokenId) : undefined,
    amount: s(order.amount),
    price: s(order.price),
    expiration: s(order.expiration),
    nonce: s(order.nonce),
    masterNonce: s(order.masterNonce),
    paymentMethod: lc(order.paymentMethod),

    sellerOrBuyer: lc(order.sellerOrBuyer),

    beneficiary: order.beneficiary !== undefined ? lc(order.beneficiary) : undefined,

    maxRoyaltyFeeNumerator:
      order.maxRoyaltyFeeNumerator !== undefined ? s(order.maxRoyaltyFeeNumerator) : undefined,

    v: order.v ?? 0,
    r: order.r ?? HashZero,
    s: order.s ?? HashZero,
  };
};
