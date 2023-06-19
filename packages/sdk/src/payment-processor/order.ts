import * as Types from "./types";
import { lc, s, n, bn } from "../utils";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { verifyTypedData } from "@ethersproject/wallet";
import { Provider } from "@ethersproject/abstract-provider";
import { Contract } from "@ethersproject/contracts";
import { AddressZero } from "@ethersproject/constants";
import ExchangeAbi from "./abis/PaymentProcessor.json";
import * as Addresses from "./addresses";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import * as Common from "../common";

export class Order {
  public chainId: number;
  public params: Types.MatchOrder;

  constructor(chainId: number, params: Types.MatchOrder) {
    this.chainId = chainId;
    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }
  }

  public async sign(signer: TypedDataSigner) {
    const [types, value] = this.getEip712TypesAndValue();
    const listingSignature = await signer._signTypedData(EIP712_DOMAIN(this.chainId), types, value);
    this.params.listingSignature = listingSignature;
  }

  public async signOffer(signer: TypedDataSigner) {
    const [types, value] = this.getEip712TypesAndValueOffer();
    const signature = await signer._signTypedData(EIP712_DOMAIN(this.chainId), types, value);
    this.params.offerSignature = signature;
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

  public checkSignature() {
    if (!this.params.listingSignature || !this.params.offerSignature) {
      throw new Error("signature empty");
    }

    const listing = this.getEip712TypesAndValue();
    const offer = this.getEip712TypesAndValueOffer();

    const seller = verifyTypedData(
      EIP712_DOMAIN(this.chainId),
      listing[0],
      listing[1],
      this.params.listingSignature
    );

    if (lc(this.params.seller) !== lc(seller)) {
      throw new Error("Invalid listing signature");
    }

    const buyer = verifyTypedData(
      EIP712_DOMAIN(this.chainId),
      offer[0],
      offer[1],
      this.params.offerSignature
    );

    if (lc(this.params.buyer) !== lc(buyer)) {
      throw new Error("Invalid offer signature");
    }
  }

  public async checkFillability(provider: Provider) {
    const chainId = await provider.getNetwork().then((n) => n.chainId);
    const exchange = new Contract(Addresses.PaymentProcessor[this.chainId], ExchangeAbi, provider);

    const [buyerMasterNonce, sellerMasterNonce] = await Promise.all([
      exchange.masterNonces(this.params.seller),
      exchange.masterNonces(this.params.buyer),
    ]);

    if (
      buyerMasterNonce.gt(this.params.buyerMasterNonce) ||
      sellerMasterNonce.gt(this.params.sellerMasterNonce)
    ) {
      throw new Error("cancelled");
    }

    if (this.params.protocol === Types.TokenProtocols.ERC721) {
      const erc721 = new Common.Helpers.Erc721(provider, this.params.tokenAddress);
      // Check ownership
      const owner = await erc721.getOwner(this.params.tokenId);
      if (lc(owner) !== lc(this.params.seller)) {
        throw new Error("no-balance");
      }

      // Check approval
      const isApproved = await erc721.isApproved(
        this.params.seller,
        Addresses.PaymentProcessor[this.chainId]
      );
      if (!isApproved) {
        throw new Error("no-approval");
      }
    } else if (this.params.protocol === Types.TokenProtocols.ERC1155) {
      const erc1155 = new Common.Helpers.Erc1155(provider, this.params.tokenAddress);
      // Check balance
      const balance = await erc1155.getBalance(this.params.seller, this.params.tokenId);
      if (bn(balance).lt(1)) {
        throw new Error("no-balance");
      }

      // Check approval
      const isApproved = await erc1155.isApproved(
        this.params.seller,
        Addresses.PaymentProcessor[this.chainId]
      );
      if (!isApproved) {
        throw new Error("no-approval");
      }
    } else {
      throw new Error("invalid");
    }

    if (this.params.paymentCoin != AddressZero) {
      // Check that maker has enough balance to cover the payment
      // and the approval to the token transfer proxy is set
      const erc20 = new Common.Helpers.Erc20(provider, this.params.paymentCoin);
      const balance = await erc20.getBalance(this.params.buyer);
      if (bn(balance).lt(this.params.listingMinPrice)) {
        throw new Error("no-balance");
      }

      // Check allowance
      const allowance = await erc20.getAllowance(
        this.params.buyer,
        Addresses.PaymentProcessor[chainId]
      );
      if (bn(allowance).lt(this.params.listingMinPrice)) {
        throw new Error("no-approval");
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getEip712TypesAndValue(): any {
    const listing: Types.SaleApproval = {
      protocol: this.params.protocol,
      sellerAcceptedOffer: this.params.sellerAcceptedOffer,
      marketplace: this.params.marketplace,
      marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,
      maxRoyaltyFeeNumerator: this.params.maxRoyaltyFeeNumerator,
      privateBuyer: this.params.privateBuyer,
      seller: this.params.seller,
      tokenAddress: this.params.tokenAddress,
      tokenId: this.params.tokenId,
      amount: this.params.amount,
      minPrice: this.params.listingMinPrice,
      expiration: this.params.listingExpiration,
      nonce: this.params.listingNonce,
      masterNonce: this.params.sellerMasterNonce,
      coin: this.params.paymentCoin,
    };
    return [EIP712_SALE_APPROVAL_TYPES, listing, "SaleApproval"];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getEip712TypesAndValueOffer(): any {
    const offer: Types.OfferApproval = {
      protocol: this.params.protocol,
      marketplace: this.params.marketplace,
      marketplaceFeeNumerator: this.params.marketplaceFeeNumerator,

      delegatedPurchaser: this.params.delegatedPurchaser,
      buyer: this.params.buyer,
      tokenAddress: this.params.tokenAddress,
      tokenId: this.params.tokenId,
      amount: this.params.amount,

      price: this.params.offerPrice,
      expiration: this.params.offerExpiration,
      nonce: this.params.offerNonce,
      masterNonce: this.params.buyerMasterNonce,
      coin: this.params.paymentCoin,
    };
    return [EIP712_OFFER_APPROVAL_TYPES, offer, "OfferApproval"];
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

export const EIP712_DOMAIN = (chainId: number) => ({
  name: "PaymentProcessor",
  version: "1",
  chainId,
  verifyingContract: Addresses.PaymentProcessor[chainId],
});

const normalize = (order: Types.MatchOrder): Types.MatchOrder => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings
  return {
    sellerAcceptedOffer: order.sellerAcceptedOffer,
    collectionLevelOffer: order.collectionLevelOffer,
    protocol: n(order.protocol),
    paymentCoin: lc(order.paymentCoin),
    tokenAddress: lc(order.tokenAddress),
    seller: lc(order.seller),
    privateBuyer: lc(order.privateBuyer),
    buyer: lc(order.buyer),
    delegatedPurchaser: lc(order.delegatedPurchaser),
    marketplace: lc(order.marketplace),
    marketplaceFeeNumerator: s(order.marketplaceFeeNumerator),
    maxRoyaltyFeeNumerator: s(order.maxRoyaltyFeeNumerator),
    listingNonce: s(order.listingNonce),
    offerNonce: s(order.offerNonce),
    listingMinPrice: s(order.listingMinPrice),
    offerPrice: s(order.offerPrice),
    listingExpiration: s(order.listingExpiration),
    offerExpiration: s(order.offerExpiration),
    tokenId: s(order.tokenId),
    amount: s(order.amount),

    sellerMasterNonce: s(order.sellerMasterNonce),
    buyerMasterNonce: s(order.buyerMasterNonce),

    listingSignature: order.listingSignature ? s(order.listingSignature) : undefined,
    offerSignature: order.offerSignature ? s(order.offerSignature) : undefined,
  };
};
