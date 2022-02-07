import { HashZero } from "@ethersproject/constants";

import { toBuffer } from "@/common/utils";

// Optional metadata associated to an order
export type OrderMetadata = {
  schemaHash?: Buffer;
};

export const defaultSchemaHash = toBuffer(HashZero);
