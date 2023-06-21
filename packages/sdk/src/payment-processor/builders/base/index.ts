import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Order } from "../../order";
import { TokenProtocols } from "../../types";
import { getRandomBytes } from "../../../utils";

export type MatchingOptions = {
  taker: string;
  takerNonce: BigNumberish;
  tokenId?: BigNumberish;
};

export interface BaseBuildParams {
  protocol: TokenProtocols;
  marketplace?: string;
  marketplaceFeeNumerator?: BigNumberish;
  tokenAddress: string;
  amount: BigNumberish;
  price: BigNumberish;
  expiration: BigNumberish;
  nonce?: BigNumberish;
  masterNonce: BigNumberish;
  coin: string;

  privateTaker?: string; // privateBuyer | delegatedPurchaser
  taker?: string;
  trader: string; // buyer | seller

  // SaleApproval
  sellerAcceptedOffer?: boolean;
  maxRoyaltyFeeNumerator?: BigNumberish;

  // CollectionOfferApproval

  collectionLevelOffer?: boolean;
  takerMasterNonce?: BigNumberish;

  v?: number;
  r?: string;
  s?: string;
}

export abstract class BaseBuilder {
  public chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  protected defaultInitialize(params: BaseBuildParams) {
    params.marketplace = params.marketplace ?? AddressZero;
    params.marketplaceFeeNumerator = params.marketplaceFeeNumerator ?? "0";
    params.maxRoyaltyFeeNumerator = params.maxRoyaltyFeeNumerator ?? "0";
    params.nonce = params.nonce ?? getRandomBytes(10);
    params.v = params.v ?? 0;
    params.r = params.r ?? HashZero;
    params.s = params.s ?? HashZero;
  }

  public abstract isValid(order: Order): boolean;
  public abstract build(params: BaseBuildParams): Order;
  public abstract buildMatching(order: Order, options: MatchingOptions): Order;
}
