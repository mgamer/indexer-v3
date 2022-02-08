import { HashZero } from "@ethersproject/constants";

// Optional metadata associated to an order
export type OrderMetadata = {
  schemaHash?: string;
};

export const defaultSchemaHash = HashZero;
