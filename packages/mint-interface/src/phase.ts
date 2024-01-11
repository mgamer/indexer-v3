import { ethers } from "ethers";
import { Builder } from "./builder.js";
import type { MintPhase, TxParam } from "./types.d";

export class Phase {
  phase: MintPhase;

  parent: Builder;

  globalMaxMintPerWallet: number;
  globalMaxMintPerTransaction: number;

  constructor(
    phase: MintPhase,
    globalMaxMintPerWallet: number,
    globalMaxMintPerTransaction: number,
    parent: Builder
  ) {
    this.phase = phase;
    this.globalMaxMintPerWallet = globalMaxMintPerWallet;
    this.globalMaxMintPerTransaction = globalMaxMintPerTransaction;
    this.parent = parent;
  }

  get startTime(): number {
    return this.phase.startTime as number;
  }

  get endTime(): number {
    return this.phase.endTime as number;
  }

  get maxMintsPerWallet(): number {
    return (
      this.phase.maxMintsPerWallet ?? this.globalMaxMintPerWallet ?? undefined
    );
  }

  get maxMintPerTransaction(): number {
    return (
      this.phase.maxMintPerTransaction ??
      this.globalMaxMintPerTransaction ??
      undefined
    );
  }

  get price(): string | null {
    if (this.phase.price == "0") return null;
    else return this.phase.price as string;
  }

  get currency(): string | null {
    return this.phase.currency ?? null;
  }

  get isOpen() {
    const timestamp = ~~(Date.now() / 1000);
    return (
      this.startTime <= timestamp &&
      (this.endTime >= timestamp || this.endTime == 0)
    );
  }

  hasRecipient() {
    return this.phase.tx.params?.find((el) => el.kind == "RECIPIENT");
  }

  hasQuantity() {
    return this.phase.tx.params?.find((el) => el.kind == "QUANTITY");
  }

  hasMappingRecipient() {
    return this.phase.tx.params?.find((el) => el.kind == "MAPPING_RECIPIENT");
  }

  maxMint() {
    let max =
      this.phase.maxMintPerTransaction ??
      this.phase.maxMintsPerWallet ??
      this.globalMaxMintPerTransaction ??
      this.globalMaxMintPerWallet;

    return max ?? 0;
  }

  getParams(): TxParam[] {
    // return the params that are supposed to be filled by the consumer
    // MAPPING_RRECIPIENT is automatically filled with the value from RECIPIENT
    return (
      this.phase.tx.params?.filter(
        (el) => el.value === undefined || el.kind == "MAPPING_RECIPIENT"
      ) ?? []
    );
  }

  // build a transaction with the given params
  buildTransaction(inputs: Record<string, any>) {
    const recipientParam = this.hasRecipient();
    if (recipientParam) {
      if (!inputs[recipientParam.name]) {
        throw new Error("Recipient needs to be set");
      }
    }

    const quantityParam = this.hasQuantity();
    if (quantityParam) {
      const quantity = inputs[quantityParam.name];
      if (quantity === undefined) {
        throw new Error("Quantity needs to be set");
      } else {
        const max = this.maxMint();
        if (max != 0) {
          if (quantity > max) {
            throw new Error("Quantity too high.");
          }
        }
      }
    }

    const mappingRecipient = this.hasMappingRecipient();
    if (mappingRecipient) {
      if (!mappingRecipient.values) {
        throw new Error("MAPPING_RECIPIENT kind requires a values field");
      }

      const values = mappingRecipient!.values as { [k: string]: any };

      let recipient = inputs[recipientParam!.name] as string;
      let mappingValue = values[recipient];
      if (!mappingValue) {
        throw new Error("Unknown recipient");
      }

      // we autofill inputs[mappingRecipient] with the corresponding value
      inputs[mappingRecipient.name] = mappingValue;
    }

    // now we check that all params have values and we can fill the arrays used to build the tx
    const txParamsTypes = [];
    const txParamsValues = [];
    for (const param of this.phase.tx.params ?? []) {
      const value = param.value ?? inputs[param.name];
      if (value === undefined || value == null) {
        throw new Error(`Parameter ${param.name} value missing`);
      }

      // add the txParam to the build
      txParamsTypes.push(param.abiType);
      txParamsValues.push(value);
    }

    // use ethers to build the tx
    const txParamsData = ethers.utils.defaultAbiCoder.encode(
      txParamsTypes,
      txParamsValues
    );

    return {
      to: this.phase.tx.to,
      data: `${this.phase.tx.method}${txParamsData.slice(2)}`,
    };
  }

  format(): any {
    const collection = this.parent.config.collection;
    const to = this.phase.tx.to;

    const params = [];
    for (const param of this.phase.tx.params ?? []) {
      params.push({
        kind: (param.kind ?? "unknown").toLowerCase(),
        abiType: param.abiType,
        abiValue: param.value,
      });
    }

    const mappingRecipient = this.hasMappingRecipient();

    const kind = mappingRecipient ? "allowlist" : "public";

    let additionalInfo;
    if (mappingRecipient) {
      additionalInfo = { mappingRecipient: mappingRecipient.values };
    }

    return {
      collection: collection,
      contract: collection,
      stage: `${kind}-sale`,
      kind,
      status: this.isOpen ? "open" : "closed",
      standard: "unknown",
      details: {
        tx: {
          to,
          data: {
            signature: this.phase.tx.method,
            params,
          },
        },
        additionalInfo,
      },
      currency: this.phase.currency ?? ethers.constants.AddressZero,
      price: this.phase.price ?? undefined,
      tokenId: this.phase.tokenId ?? undefined,
      maxMintsPerWallet: this.maxMintsPerWallet,
      maxMintsPerTransaction: this.maxMintPerTransaction,
      maxSupply: this.parent.maxSupply || undefined,
      startTime: this.startTime || undefined,
      endTime: this.endTime || undefined,
    };
  }
}
