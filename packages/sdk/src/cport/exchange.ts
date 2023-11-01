import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract, ContractTransaction } from "@ethersproject/contracts";
import { defaultAbiCoder } from "@ethersproject/abi";
import { HashZero } from "@ethersproject/constants";
import { MatchingOptions } from "./builders/base";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData, generateSourceBytes } from "../utils";

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
    }
  ): TxData {
    const matchedOrder = order.buildMatching(matchOptions);
    const isCollectionOffer = order.params.kind === "collection-offer-approval";
    const data = order.isBuyOrder()
      ? this.contract.interface.encodeFunctionData("acceptOffer", [
          defaultAbiCoder.encode(
            [
              "bytes32",
              "bool",
              "(uint8 protocol,address maker,address beneficiary,address marketplace,address paymentMethod,address tokenAddress,uint256 tokenId,uint248 amount,uint256 itemPrice,uint256 nonce,uint256 expiration,uint256 marketplaceFeeNumerator,uint256 maxRoyaltyFeeNumerator,uint248 requestedFillAmount,uint248 minimumFillAmount)",
              "(uint8 v,bytes32 r,bytes32 s)",
              "(bytes32 rootHash,bytes32[] proof)",
            ],
            [
              Addresses.DomainSeparator[this.chainId],
              isCollectionOffer,
              matchedOrder,
              matchedOrder.signature,
              {
                rootHash: HashZero,
                proof: [],
              },
            ]
          ),
        ])
      : this.contract.interface.encodeFunctionData("buyListing", [
          defaultAbiCoder.encode(
            [
              "bytes32",
              "(uint8 protocol,address maker,address beneficiary,address marketplace,address paymentMethod,address tokenAddress,uint256 tokenId,uint248 amount,uint256 itemPrice,uint256 nonce,uint256 expiration,uint256 marketplaceFeeNumerator,uint256 maxRoyaltyFeeNumerator,uint248 requestedFillAmount,uint248 minimumFillAmount)",
              "(uint8 v,bytes32 r,bytes32 s)",
            ],
            [Addresses.DomainSeparator[this.chainId], matchedOrder, matchedOrder.signature]
          ),
        ]);

    const passValue =
      !order.isBuyOrder() &&
      order.params.sellerOrBuyer != taker.toLowerCase() &&
      matchedOrder.paymentMethod === AddressZero;
    return {
      from: taker,
      to: this.contract.address,
      value: passValue ? order.params.price.toString() : "0",
      data: data + generateSourceBytes(options?.source),
    };
  }

  // --- Check if operator is allowed to transfer ---

  public async isTransferAllowed(
    provider: Provider,
    contract: string,
    operator: string,
    from: string,
    to: string
  ) {
    const c = new Contract(
      contract,
      new Interface([
        "function isTransferAllowed(address caller, address from, address to) view returns (bool)",
      ]),
      provider
    );
    return c.isTransferAllowed(operator, from, to);
  }
}
