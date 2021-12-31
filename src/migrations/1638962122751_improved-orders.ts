import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns("orders", {
    taker: {
      type: "text",
    },
    source_info: {
      type: "jsonb",
    },
    royalty_info: {
      type: "jsonb",
    },
  });

  // TODO: These fields are just temporary, we should be able
  // to use the newly added `label` and `label_hash` fields
  // to achieve the same results everywhere in a cleaner way
  pgm.addColumns("token_sets", {
    contract: {
      type: "text",
    },
    token_id: {
      type: "numeric(78, 0)",
    },
    collection_id: {
      type: "text",
    },
  });

  pgm.addIndex("token_sets", ["contract", "token_id"]);
  pgm.addIndex("token_sets", ["collection_id"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("token_sets", ["contract", "token_id", "collection_id"]);

  pgm.dropColumns("orders", ["taker", "source_info", "royalty_info"]);
}
