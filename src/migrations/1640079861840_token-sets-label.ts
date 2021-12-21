import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns("token_sets", {
    label: {
      type: "jsonb",
    },
    label_hash: {
      type: "text",
    },
  });

  // TODO: Investigate if `contract`, `token_id` and `collection_id` fields
  // are still needed now that we keep track of the label and its hash

  pgm.addIndex("token_sets", ["label_hash"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex("token_sets", ["label_hash"]);

  pgm.dropColumns("token_sets", ["label", "label_hash"]);
}
