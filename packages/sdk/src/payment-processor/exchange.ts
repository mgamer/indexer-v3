import { Provider } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract, ContractTransaction } from "@ethersproject/contracts";
import { splitSignature } from "@ethersproject/bytes";
import { Result } from "@ethersproject/abi";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData, generateSourceBytes, bn } from "../utils";

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
  public attchPostSignature(txData: string, signatures: string[]) {
    const iface = this.contract.interface;
    const isBatch = txData.startsWith("0x5ed1f9bb");
    const inputs = isBatch
      ? iface.decodeFunctionData("buyBatchOfListings", txData)
      : iface.decodeFunctionData("buySingleListing", txData);

    const rawCalldata = isBatch
      ? iface.encodeFunctionData("buyBatchOfListings", [
          inputs.saleDetailsArray,
          inputs.signedListings,
          inputs.signedOffers,
        ])
      : iface.encodeFunctionData("buySingleListing", [
          inputs.saleDetails,
          inputs.signedListing,
          inputs.signedOffer,
        ]);

    const sourceBytes = txData.substring(rawCalldata.length, txData.length);

    const saleDetailsArray = isBatch ? inputs.saleDetailsArray : [inputs.saleDetails];
    const signedListings = isBatch ? inputs.signedListings : [inputs.signedListing];
    const signedOffers = isBatch ? inputs.signedOffers : [inputs.signedOffer];

    const newSaleDetails = saleDetailsArray.map((c: Result, index: number) => {
      const signedListing = signedListings[index];
      const signedOffer = signedOffers[index];
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

      const { r, s, v } = splitSignature(signatures[index]);
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

      return {
        saleDetail: c,
        signedListing: newSignedListing,
        signedOffer: newSignedOffer,
      };
    });

    return isBatch
      ? iface.encodeFunctionData("buyBatchOfListings", [
          newSaleDetails.map((c: Result) => c.saleDetail),
          newSaleDetails.map((c: Result) => c.signedListing),
          newSaleDetails.map((c: Result) => c.signedOffer),
        ])
      : iface.encodeFunctionData("buySingleListing", [
          newSaleDetails[0].saleDetail,
          newSaleDetails[0].signedListing,
          newSaleDetails[0].signedOffer,
        ]) + sourceBytes;
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

  public fillOrdersTx(
    taker: string,
    orders: Order[],
    matchOrders: Order[],
    options?: {
      source?: string;
    }
  ): TxData {
    let price = bn(0);
    const saleDetails = orders.map((c, index) => {
      const matchOrder = c.getMatchedOrder(matchOrders[index]);
      const passValue =
        matchOrder.buyer === taker.toLowerCase() && matchOrder.paymentCoin === AddressZero;
      if (passValue) {
        price = price.add(c.params.price);
      }
      return matchOrder;
    });

    const data = this.contract.interface.encodeFunctionData("buyBatchOfListings", [
      saleDetails,
      saleDetails.map((c) => c.listingSignature),
      saleDetails.map((c) => c.offerSignature),
    ]);

    return {
      from: taker,
      to: this.contract.address,
      value: price.toString(),
      data: data + generateSourceBytes(options?.source),
    };
  }
}
