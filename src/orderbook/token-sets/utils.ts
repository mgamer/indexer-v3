// TODO: Integrate all supported schemas
export type TokenSetSchema = {
  kind: "collection-non-flagged";
  data: {
    collection: string;
  };
};

export type TokenSet = {
  id: string;
  schemaHash: string;
  schema: TokenSetSchema;
};
