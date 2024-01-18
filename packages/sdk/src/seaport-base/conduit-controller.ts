import { Contract } from "@ethersproject/contracts";
import * as Addresses from "./addresses";
import ConduitControllerAbi from "./abis/ConduitController.json";
import { keccak256 as solidityKeccak256 } from "@ethersproject/solidity";
import { Provider } from "@ethersproject/abstract-provider";

export class ConduitController {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number, provider?: Provider) {
    this.chainId = chainId;
    this.contract = new Contract(
      Addresses.ConduitController[this.chainId],
      ConduitControllerAbi,
      provider
    );
  }

  public deriveConduit(conduitKey: string) {
    return (
      "0x" +
      solidityKeccak256(
        ["bytes1", "address", "bytes32", "bytes32"],
        [
          "0xff",
          Addresses.ConduitController[this.chainId],
          conduitKey,
          Addresses.ConduitControllerCodeHash[this.chainId],
        ]
      ).slice(-40)
    );
  }

  public async getChannelStatus(conduit: string, channelAddress: string): Promise<boolean> {
    return await this.contract.getChannelStatus(conduit, channelAddress);
  }
}
