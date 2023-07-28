import { Provider } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract, ContractTransaction } from "@ethersproject/contracts";
import { splitSignature } from "@ethersproject/bytes";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/PaymentProcessor.json";

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
        order.params.marketplace,
        order.params.nonce,
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

  // --- Fill order ---

  public async fillOrder(
    taker: Signer,
    order: Order,
    matchOrder: Order,
    options?: {
      source?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillOrderTx(await taker.getAddress(), order, matchOrder, options);
    return taker.sendTransaction(tx);
  }

  // Attch the taker's signature to the calldata
  public attchPostSignature(txData: string, signature: string) {
    const { signedListing, signedOffer, saleDetails } = this.contract.interface.decodeFunctionData(
      "buySingleListing",
      txData
    );

    const rawCalldata = this.contract.interface.encodeFunctionData("buySingleListing", [
      saleDetails,
      signedListing,
      signedOffer,
    ]);

    const sourceBytes = txData.substring(rawCalldata.length, txData.length);

    let newSignedListing = {
      r: signedListing.r,
      s: signedListing.s,
      v: signedListing.v,
    };

    let newSignedOffer = {
      r: signedOffer.r,
      s: signedOffer.s,
      v: signedOffer.v,
    };

    const { r, s, v } = splitSignature(signature);
    if (signedOffer.v === 0) {
      newSignedOffer = {
        r,
        s,
        v,
      };
    }

    if (signedListing.v === 0) {
      newSignedListing = {
        r,
        s,
        v,
      };
    }

    return (
      this.contract.interface.encodeFunctionData("buySingleListing", [
        saleDetails,
        newSignedListing,
        newSignedOffer,
      ]) + sourceBytes
    );
  }

  public fillOrderTx(
    taker: string,
    order: Order,
    matchOrder: Order,
    options?: {
      source?: string;
    }
  ): TxData {
    const macthOrder = order.getMatchedOrder(matchOrder);
    const data = this.contract.interface.encodeFunctionData("buySingleListing", [
      macthOrder,
      macthOrder.listingSignature,
      macthOrder.offerSignature,
    ]);

    const passValue =
      macthOrder.buyer === taker.toLowerCase() && macthOrder.paymentCoin === AddressZero;
    return {
      from: taker,
      to: this.contract.address,
      value: passValue ? order.params.price.toString() : "0",
      data: data + generateSourceBytes(options?.source),
    };
  }
}
