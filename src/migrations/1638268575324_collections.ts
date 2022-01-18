import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("collections", {
    id: {
      type: "text",
      notNull: true,
    },
    name: {
      type: "text",
    },
    description: {
      type: "text",
    },
    image: {
      type: "text",
    },
    community: {
      type: "text",
    },
    royalty_bps: {
      type: "int",
    },
    royalty_recipient: {
      type: "text",
    },
  });
  pgm.addConstraint("collections", "collections_pk", {
    primaryKey: ["id"],
  });

  pgm.addColumns("tokens", {
    name: {
      type: "text",
    },
    description: {
      type: "text",
    },
    image: {
      type: "text",
    },
    collection_id: {
      type: "text",
    },
  });

  pgm.createIndex("tokens", ["collection_id", "floor_sell_value"]);
  pgm.createIndex("tokens", ["collection_id", "top_buy_value"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("tokens", ["name", "description", "image", "collection_id"]);

  pgm.dropTable("collections");
}
