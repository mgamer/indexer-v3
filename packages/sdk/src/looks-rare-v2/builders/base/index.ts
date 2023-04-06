import { BigNumberish } from "@ethersproject/bignumber";
import { HashZero } from "@ethersproject/constants";

import { Order } from "../../order";
import { TakerOrderParams, QuoteType, CollectionType } from "../../types";
import { getCurrentTimestamp } from "../../../utils";

export interface BaseBuildParams {
  quoteType: QuoteType;
  globalNonce?: BigNumberish;
  subsetNonce?: BigNumberish;
  orderNonce?: BigNumberish;
  strategyId?: number;
  collectionType: CollectionType;

  collection: string;
  currency: string;
  price: BigNumberish;
  signer: string;

  startTime: number;
  endTime: number;
  itemIds: BigNumberish[];
  amounts: BigNumberish[];

  additionalParameters?: string;
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
    params.startTime = params.startTime ?? getCurrentTimestamp(-1 * 60);
    params.endTime = params.endTime ?? getCurrentTimestamp(24 * 60 * 60);
    // params.minPercentageToAsk = params.minPercentageToAsk ?? 8500;
    // params.nonce = params.nonce ?? getRandomBytes(10);
    params.v = params.v ?? 0;
    params.r = params.r ?? HashZero;
    params.s = params.s ?? HashZero;
  }

  public abstract isValid(order: Order): boolean;
  public abstract build(params: BaseBuildParams): Order;
  public abstract buildMatching(
    order: Order,
    taker: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any
  ): TakerOrderParams;
}
