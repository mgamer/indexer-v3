/* eslint-disable @typescript-eslint/no-explicit-any */

import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import axios from "axios";
import { TypedDataDomain, TypedDataField } from "@ethersproject/abstract-signer";

export type ExternalCosigKey = {
  signer: string;
  endpoint: string;
  apiKey: string;
};

export type CoSignRequest = {
  signer: string;
  authKey: string;
  method: "eth_signTypedData_v4"; // eth_sign or more
  params: any[];
};

export type CoSignResponse = {
  signature: string;
};

export async function upsertExternalCosignKey(key: ExternalCosigKey, internalAPIKey: string) {
  const existKey = await idb.oneOrNone(
    `
            SELECT
                cosign_keys.signer,
                cosign_keys.endpoint,
                cosign_keys.api_key,
                cosign_keys.creator
            FROM cosign_keys
            WHERE cosign_keys.signer = $/signer/
        `,
    {
      signer: toBuffer(key.signer),
    }
  );

  if (existKey) {
    if (existKey.creator != internalAPIKey) {
      throw Error("No permission to edit");
    }
  }

  await idb.none(
    `
        INSERT INTO cosign_keys (
            signer,
            endpoint,
            api_key,
            creator
        ) VALUES (
            $/signer/,
            $/endpoint/,
            $/api_key/,
            $/creator/
        ) ON CONFLICT (signer) DO UPDATE SET
            endpoint = $/endpoint/,
            api_key = $/api_key/,
            creator = $/creator/
        `,
    {
      signer: toBuffer(key.signer),
      endpoint: key.endpoint,
      api_key: key.apiKey,
      creator: internalAPIKey,
    }
  );
}

export async function getExternalCosignKey(cosigner: string): Promise<ExternalCosigKey | null> {
  const result = await idb.oneOrNone(
    `
            SELECT
                cosign_keys.signer,
                cosign_keys.endpoint,
                cosign_keys.api_key,
                cosign_keys.creator
            FROM cosign_keys
            WHERE cosign_keys.signer = $/signer/
        `,
    {
      signer: toBuffer(cosigner),
    }
  );
  if (!result) return null;
  return {
    signer: cosigner,
    endpoint: result.endpoint,
    apiKey: result.api_key,
  };
}

export async function signTypedDataWithCosign(cosigner: string, typedData: any) {
  const externalCosigKey = await getExternalCosignKey(cosigner);
  if (!externalCosigKey) throw new Error("external cosign key not exists");
  const response = await axios
    .post(
      `${externalCosigKey.endpoint}/eth/cosign`,
      {
        cosigner,
        method: "eth_signTypedData_v4",
        params: [typedData],
      },
      {
        headers: {
          "x-api-key": externalCosigKey.apiKey,
        },
      }
    )
    .then(({ data }) => data as CoSignResponse);
  return response.signature;
}

export class ExternalTypedDataSigner {
  public externalCosignKey: ExternalCosigKey;
  constructor(_externalCosignKey: ExternalCosigKey) {
    this.externalCosignKey = _externalCosignKey;
  }
  async _signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, any>
  ): Promise<string> {
    const signature = await signTypedDataWithCosign(this.externalCosignKey.signer, {
      domain,
      types,
      message: value,
    });
    return signature;
  }
}
