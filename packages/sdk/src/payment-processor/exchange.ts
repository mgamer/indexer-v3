import { Signer } from "@ethersproject/abstract-signer";
import { Contract, ContractTransaction } from "@ethersproject/contracts";
import { AddressZero } from "@ethersproject/constants";
import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData, generateSourceBytes } from "../utils";
import { Provider } from "@ethersproject/abstract-provider";
import ExchangeAbi from "./abis/PaymentProcessor.json";
import { BigNumber } from "@ethersproject/bignumber";

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
        order.params.marketplace,
        order.params.nonce,
      ]),
    };
  }

  public async cancelAllOrders(maker: Signer): Promise<ContractTransaction> {
    const tx = this.cancelAllOrdersTx(await maker.getAddress());
    return maker.sendTransaction(tx);
  }

  public cancelAllOrdersTx(maker: string): TxData {
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("revokeMasterNonce", []),
    };
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
    matchOrder: Order,
    options?: {
      source?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillOrderTx(await taker.getAddress(), order, matchOrder, options);
    return taker.sendTransaction({
      ...tx,
      gasLimit: 1000000,
    });
  }

  public fillOrderTx(
    taker: string,
    order: Order,
    matchOrder: Order,
    options?: {
      source?: string;
    }
  ): TxData {
    const macthOrder = order.getMatchOrder(matchOrder);
    const data = this.contract.interface.encodeFunctionData("buySingleListing", [
      macthOrder,
      macthOrder.listingSignature,
      macthOrder.offerSignature,
    ]);

    const isTaker =
      macthOrder.buyer === taker.toLowerCase() && macthOrder.paymentCoin === AddressZero;
    return {
      from: taker,
      to: this.contract.address,
      value: isTaker ? order.params.price.toString() : "0",
      data: data + generateSourceBytes(options?.source),
    };
  }
}
