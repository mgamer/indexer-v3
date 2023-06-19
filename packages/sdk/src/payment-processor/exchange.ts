import { Signer } from "@ethersproject/abstract-signer";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData, generateSourceBytes } from "../utils";
import { Provider } from "@ethersproject/abstract-provider";
import ExchangeAbi from "./abis/PaymentProcessor.json";
import { BigNumber } from "@ethersproject/bignumber";
import { splitSignature } from "@ethersproject/bytes";

// Blend:
// - escrowed orderbook

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.PaymentProcessor[this.chainId], ExchangeAbi);
  }

  // --- Get nonce ---

  public async getNonce(provider: Provider, user: string): Promise<BigNumber> {
    return this.contract.connect(provider).masterNonces(user);
  }

  // --- Increase nonce ---

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

  public async fillOrder(
    taker: Signer,
    order: Order,
    options?: {
      source?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillOrderTx(await taker.getAddress(), order, options);
    return taker.sendTransaction(tx);
  }

  public fillOrderTx(
    taker: string,
    order: Order,
    options?: {
      source?: string;
    }
  ): TxData {
    const data = this.contract.interface.encodeFunctionData("buySingleListing", [
      order.params,
      splitSignature(order.params.listingSignature!),
      splitSignature(order.params.offerSignature!),
    ]);

    const isTaker = order.params.buyer === taker.toLowerCase();
    return {
      from: taker,
      to: this.contract.address,
      value: isTaker ? order.params.listingMinPrice.toString() : "0",
      data: data + generateSourceBytes(options?.source),
    };
  }
}
