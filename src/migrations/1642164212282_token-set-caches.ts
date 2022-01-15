import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns("token_sets", {
    top_buy_hash: {
      type: "text",
    },
    top_buy_value: {
      type: "numeric(78, 0)",
    },
    last_buy_block: {
      type: "int",
    },
    last_buy_value: {
      type: "numeric(78, 0)",
    },
  });

  pgm.createIndex("token_sets", [
    "collection_id",
    "attribute_key",
    "attribute_value",
    "top_buy_value",
  ]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("token_sets", [
    "top_buy_hash",
    "top_buy_value",
    "last_buy_block",
    "last_buy_value",
  ]);
}
