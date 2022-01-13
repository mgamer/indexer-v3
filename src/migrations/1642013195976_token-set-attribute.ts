import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns("token_sets", {
    attribute_key: {
      type: "text",
    },
    attribute_value: {
      type: "text",
    },
    metadata: {
      type: "jsonb",
    },
  });

  pgm.dropIndex("token_sets", ["collection_id"]);
  pgm.addIndex("token_sets", [
    "collection_id",
    "attribute_key",
    "attribute_value",
  ]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("token_sets", [
    "attribute_key",
    "attribute_value",
    "metadata",
  ]);
}
