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

  // TODO: We definitely need to rethink the design of the attribute tables
  pgm.addIndex("attributes", ["collection_id", "key", "value"], {
    name: "attributes_collection_id_key_value_index_2",
    where: `"rank" is not null and ("kind" = 'string' or "kind" = 'number')`,
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("attributes", ["collection_id"]);
}
