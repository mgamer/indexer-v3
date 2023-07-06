// import { Signer } from "@ethersproject/abstract-signer";
import { Contract } from "@ethersproject/contracts";
import * as Addresses from "./addresses";
// import { TxData, generateSourceBytes } from "../utils";
// import { Provider } from "@ethersproject/abstract-provider";
import ExchangeAbi from "./abis/BlurV2.json";

// Blend:
// - escrowed orderbook

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
  }
}
