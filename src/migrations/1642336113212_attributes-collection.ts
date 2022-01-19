import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns("attributes", {
    collection_id: {
      type: "text",
    },
  });

  pgm.createIndex("attributes", ["collection_id", "key", "value"], {
    // include: ["contract", "token_id"],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("attributes", ["collection_id"]);
}
