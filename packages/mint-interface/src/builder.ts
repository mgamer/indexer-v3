import { ethers } from "ethers";
import { Phase } from "./phase.js";
import type { BuilderConfig, ContractCall, MintConfig } from "./types.d";

export const TxParamKind = [
  "RECIPIENT",
  "QUANTITY",
  "MAPPING_RECIPIENT",
  "REFERRAL",
];

// RECIPIENT -> The address to which the NFT has to be minted to
// QUANTITY -> The quantity to mint
// MAPPING_RECIPIENT -> If present, the TxParam "values" must be set and should be a a mapping(address => abiType)
//                      This can only be used with a field of kind: "RECIPIENT" and only if "RECIPIENT" is present in the mapping

export async function parseConfig(
  mintConfig: MintConfig,
  config: BuilderConfig
) {
  const builder = new Builder(mintConfig, config);
  await builder.load();
  return builder;
}

export class Builder {
  mintConfig: MintConfig;
  config: BuilderConfig;

  provider: any;

  maxSupply: number = 0;

  private _phases: Phase[] = [];

  constructor(mintConfig: MintConfig, config: BuilderConfig) {
    this.mintConfig = mintConfig;
    this.config = config;
  }

  async load() {
    const maxMintPerWallet = await this.valueOrContractCall(
      this.mintConfig.maxMintPerWallet ?? 0
    );

    const maxMintPerTransaction = await this.valueOrContractCall(
      this.mintConfig.maxMintPerTransaction ?? 0
    );

    this.maxSupply = await this.valueOrContractCall(
      this.mintConfig.maxSupply ?? 0
    );

    // go through all phases
    const phases = [];
    for (const phase of this.mintConfig.phases) {
      // load data if any contract call needed
      phase.startTime = (await this.valueOrContractCall(
        phase.startTime
      )) as number;

      phase.endTime = (await this.valueOrContractCall(phase.endTime)) as number;
      phase.price = String(await this.valueOrContractCall(phase.price ?? "0"));

      // set some default data if needed
      if (!phase.tx.to) {
        phase.tx.to = this.config.collection;
      }

      if (phase.tx.params) {
        for (const param of phase.tx.params) {
          if (param.kind) {
            if (!TxParamKind.find((el) => el == param.kind)) {
              throw new Error(`Unknown TxParamKind ${param.kind}`);
            }
          }
        }
      }

      const phaseO = new Phase(
        phase,
        maxMintPerWallet,
        maxMintPerTransaction,
        this
      );
      phases.push(phaseO);
    }

    this._phases = phases;
  }

  get phases(): Phase[] {
    return this._phases;
  }

  // returns the phase for a given timestamp
  async getPhasesAt(timestamp: number): Promise<Phase[]> {
    return this.phases.filter((el) => {
      return (
        el.startTime <= timestamp &&
        (el.endTime >= timestamp || el.endTime == 0)
      );
    });
  }

  async getCurrentPhases(): Promise<Phase[]> {
    const timestamp = ~~(Date.now() / 1000);
    return this.getPhasesAt(timestamp);
  }

  private async valueOrContractCall(value: any | ContractCall): Promise<any> {
    if (typeof value != "object") {
      return value;
    }

    // @todo check for bignumber

    const contract = new ethers.Contract(
      value.to || this.config.collection,
      value.abi,
      this.config.provider
    );

    const data = await contract[value.functionName](...(value.inputs ?? []));

    // @todo implement some data[pathToValue]?
    return data;
  }
}

interface MintGlobalConfig {
  maxSupply?: number;
  maxMintPerWallet?: number;
  maxMintPerTransaction?: number;
}
