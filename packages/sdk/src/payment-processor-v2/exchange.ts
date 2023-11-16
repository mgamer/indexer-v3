import { Provider } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract, ContractTransaction } from "@ethersproject/contracts";
import { defaultAbiCoder } from "@ethersproject/abi";
import { MatchingOptions } from "./builders/base";
import { BigNumberish } from "@ethersproject/bignumber";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData, bn, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/cPort.json";

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
  }

  // --- Get master nonce ---

  public async getMasterNonce(provider: Provider, user: string): Promise<BigNumber> {
    return this.contract.connect(provider).masterNonces(user);
  }

  // --- Cancel order ---

  public async cancelOrder(maker: Signer, order: Order): Promise<ContractTransaction> {
    const tx = this.cancelOrderTx(await maker.getAddress(), order);
    return maker.sendTransaction(tx);
  }

  public cancelOrderTx(maker: string, order: Order): TxData {
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("revokeSingleNonce", [
        defaultAbiCoder.encode(["uint256"], [order.params.nonce]),
      ]),
    };
  }

  // --- Increase master nonce ---

  public async revokeMasterNonce(maker: Signer): Promise<ContractTransaction> {
    const tx = this.revokeMasterNonceTx(await maker.getAddress());
    return maker.sendTransaction(tx);
  }

  public revokeMasterNonceTx(maker: string): TxData {
    const data: string = this.contract.interface.encodeFunctionData("revokeMasterNonce", []);
    return {
      from: maker,
      to: this.contract.address,
      data,
    };
  }

  // --- Fill single order ---

  public async fillOrder(
    taker: Signer,
    order: Order,
    matchOptions: MatchingOptions,
    options?: {
      source?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillOrderTx(await taker.getAddress(), order, matchOptions, options);
    return taker.sendTransaction({
      ...tx,
      gasLimit: 1000000,
    });
  }

  public fillOrderTx(
    taker: string,
    order: Order,
    matchOptions: MatchingOptions,
    options?: {
      source?: string;
    },
    fee?: {
      recipient: string;
      amount: BigNumberish;
    }
  ): TxData {
    const feeOnTop = fee ?? {
      recipient: AddressZero,
      amount: bn(0),
    };

    const matchedOrder = order.buildMatching(matchOptions);
    const isCollectionOffer = order.isCollectionLevelOffer();
    const data = order.isBuyOrder()
      ? this.contract.interface.encodeFunctionData("acceptOffer", [
          defaultAbiCoder.encode(
            [
              "bytes32 domainSeparator",
              "bool isCollectionLevelOffer",
              "(uint8 protocol,address maker,address beneficiary,address marketplace,address paymentMethod,address tokenAddress,uint256 tokenId,uint248 amount,uint256 itemPrice,uint256 nonce,uint256 expiration,uint256 marketplaceFeeNumerator,uint256 maxRoyaltyFeeNumerator,uint248 requestedFillAmount,uint248 minimumFillAmount) saleDetails",
              "(uint8 v,bytes32 r,bytes32 s) buyerSignature",
              "(bytes32 rootHash,bytes32[] proof) tokenSetProof",
              "(address signer,address taker,uint256 expiration,uint8 v,bytes32 r,bytes32 s) cosignature",
              "(address recipient,uint256 amount) feeOnTop",
            ],
            [
              Addresses.DomainSeparator[this.chainId],
              isCollectionOffer,
              matchedOrder,
              matchedOrder.signature,
              order.getTokenSetProof(),
              order.getCosignature(),
              feeOnTop,
            ]
          ),
        ])
      : this.contract.interface.encodeFunctionData("buyListing", [
          defaultAbiCoder.encode(
            [
              "bytes32 domainSeparator",
              "(uint8 protocol,address maker,address beneficiary,address marketplace,address paymentMethod,address tokenAddress,uint256 tokenId,uint248 amount,uint256 itemPrice,uint256 nonce,uint256 expiration,uint256 marketplaceFeeNumerator,uint256 maxRoyaltyFeeNumerator,uint248 requestedFillAmount,uint248 minimumFillAmount) saleDetails",
              "(uint8 v,bytes32 r,bytes32 s) sellerSignature",
              "(address signer,address taker,uint256 expiration,uint8 v,bytes32 r,bytes32 s) cosignature",
              "(address recipient,uint256 amount) feeOnTop",
            ],
            [
              Addresses.DomainSeparator[this.chainId],
              matchedOrder,
              matchedOrder.signature,
              order.getCosignature(),
              feeOnTop,
            ]
          ),
        ]);

    const passValue =
      !order.isBuyOrder() &&
      order.params.sellerOrBuyer != taker.toLowerCase() &&
      matchedOrder.paymentMethod === AddressZero;

    return {
      from: taker,
      to: this.contract.address,
      value: passValue ? bn(order.params.price).add(feeOnTop.amount).toString() : "0",
      data: data + generateSourceBytes(options?.source),
    };
  }

  // --- Fill multiple orders ---

  public fillOrdersTx(
    taker: string,
    orders: Order[],
    matchOptions: MatchingOptions,
    options?: {
      source?: string;
    },
    fees?: {
      recipient: string;
      amount: BigNumberish;
    }[]
  ): TxData {
    if (orders.length === 1) {
      return this.fillOrderTx(taker, orders[0], matchOptions, options, fees ? fees[0] : undefined);
    }

    const feeOnTop = {
      recipient: AddressZero,
      amount: bn(0),
    };

    const allFees: {
      recipient: string;
      amount: BigNumberish;
    }[] = [];

    let price = bn(0);
    const isBuyOrder = orders[0].isBuyOrder();
    if (isBuyOrder) {
      const saleDetails = orders.map((order, index) => {
        const matchedOrder = order.buildMatching(matchOptions);
        const fee = fees && fees[index] ? fees[index] : feeOnTop;
        allFees.push(fee);
        return matchedOrder;
      });

      const data = this.contract.interface.encodeFunctionData("bulkAcceptOffers", [
        defaultAbiCoder.encode(
          [
            "bytes32",
            `
            (
              bool[] isCollectionLevelOfferArray,
              (uint8 protocol,address maker,address beneficiary,address marketplace,address paymentMethod,address tokenAddress,uint256 tokenId,uint248 amount,uint256 itemPrice,uint256 nonce,uint256 expiration,uint256 marketplaceFeeNumerator,uint256 maxRoyaltyFeeNumerator,uint248 requestedFillAmount,uint248 minimumFillAmount)[] saleDetailsArray,
              (uint8 v,bytes32 r,bytes32 s)[] buyerSignaturesArray,
              (bytes32 rootHash,bytes32[] proof)[] tokenSetProofsArray,
              (address signer,address taker,uint256 expiration,uint8 v,bytes32 r,bytes32 s)[] cosignaturesArray,
              (address recipient,uint256 amount)[] feesOnTopArray
            )
            `,
          ],
          [
            Addresses.DomainSeparator[this.chainId],
            {
              isCollectionLevelOfferArray: orders.map((c) => c.isCollectionLevelOffer()),
              saleDetailsArray: saleDetails,
              buyerSignaturesArray: saleDetails.map((c) => c.signature),
              tokenSetProofsArray: orders.map((c) => c.getTokenSetProof()),
              cosignaturesArray: orders.map((c) => c.getCosignature()),
              feesOnTopArray: allFees,
            },
          ]
        ),
      ]);

      return {
        from: taker,
        to: this.contract.address,
        data: data + generateSourceBytes(options?.source),
      };
    }

    const saleDetails = orders.map((order, index) => {
      const matchedOrder = order.buildMatching(matchOptions);
      const passValue =
        !order.isBuyOrder() &&
        order.params.sellerOrBuyer != taker.toLowerCase() &&
        matchedOrder.paymentMethod === AddressZero;

      const fee = fees && fees[index] ? fees[index] : feeOnTop;
      if (passValue) {
        price = price.add(order.params.price);
      }

      price = price.add(fee.amount);

      allFees.push(fee);

      return matchedOrder;
    });

    const data = this.contract.interface.encodeFunctionData("bulkBuyListings", [
      defaultAbiCoder.encode(
        [
          "bytes32",
          "(uint8 protocol,address maker,address beneficiary,address marketplace,address paymentMethod,address tokenAddress,uint256 tokenId,uint248 amount,uint256 itemPrice,uint256 nonce,uint256 expiration,uint256 marketplaceFeeNumerator,uint256 maxRoyaltyFeeNumerator,uint248 requestedFillAmount,uint248 minimumFillAmount)[]",
          "(uint8 v,bytes32 r,bytes32 s)[]",
          "(address signer,address taker,uint256 expiration,uint8 v,bytes32 r,bytes32 s)[]",
          "(address recipient,uint256 amount)[]",
        ],
        [
          Addresses.DomainSeparator[this.chainId],
          saleDetails,
          saleDetails.map((c) => c.signature),
          orders.map((c) => c.getCosignature()),
          allFees,
        ]
      ),
    ]);

    return {
      from: taker,
      to: this.contract.address,
      value: price.toString(),
      data: data + generateSourceBytes(options?.source),
    };
  }

  // --- Fill multiple listings from the same collection ---

  public sweepCollectionTx(
    taker: string,
    orders: Order[],
    options?: {
      source?: string;
    },
    fee?: {
      recipient: string;
      amount: BigNumberish;
    }
  ): TxData {
    let price = bn(0);
    const feeOnTop = fee ?? {
      recipient: AddressZero,
      amount: bn(0),
    };

    orders.forEach((order) => {
      const passValue = order.params.paymentMethod === AddressZero;
      if (passValue) {
        price = price.add(order.params.price);
      }
    });

    const sweepCollectionParams = Order.getSweepOrderParams(taker, orders);
    const data = this.contract.interface.encodeFunctionData("sweepCollection", [
      defaultAbiCoder.encode(
        [
          "bytes32",
          "(address recipient,uint256 amount)",
          "(uint8 protocol,address tokenAddress,address paymentMethod,address beneficiary)",
          "(address maker,address marketplace,uint256 tokenId,uint248 amount,uint256 itemPrice,uint256 nonce,uint256 expiration,uint256 marketplaceFeeNumerator,uint256 maxRoyaltyFeeNumerator)[]",
          "(uint8 v,bytes32 r,bytes32 s)[]",
          "(address signer,address taker,uint256 expiration,uint8 v,bytes32 r,bytes32 s)[]",
        ],
        [
          Addresses.DomainSeparator[this.chainId],
          feeOnTop,
          sweepCollectionParams.sweepOrder,
          sweepCollectionParams.items,
          sweepCollectionParams.signedSellOrders,
          sweepCollectionParams.cosignatures,
        ]
      ),
    ]);

    return {
      from: taker,
      to: this.contract.address,
      value: price.toString(),
      data: data + generateSourceBytes(options?.source),
    };
  }
}
