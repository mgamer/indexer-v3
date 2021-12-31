import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType("attribute_kind_t", ["number", "string"]);

  pgm.createTable("attributes", {
    contract: {
      type: "text",
      notNull: true,
    },
    token_id: {
      type: "numeric(78, 0)",
      notNull: true,
    },
    key: {
      type: "text",
      notNull: true,
    },
    value: {
      type: "text",
      notNull: true,
    },
    kind: {
      type: "attribute_kind_t",
      notNull: true,
      default: "string",
    },
  });
  pgm.createConstraint("attributes", "attributes_pk", {
    primaryKey: ["contract", "token_id", "key", "value"],
  });

  pgm.addColumns("collections", {
    filterable_attribute_keys: {
      type: "jsonb",
    },
    sortable_attribute_keys: {
      type: "jsonb",
    },
  });

  pgm.addColumns("tokens", {
    metadata_indexed: {
      type: "bool",
      notNull: true,
      default: false,
    },
  });

  pgm.addIndex("tokens", ["metadata_indexed"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("tokens", ["metadata_indexed"]);

  pgm.dropColumns("collections", [
    "filterable_attribute_keys",
    "sortable_attribute_keys",
  ]);

  pgm.dropTable("attributes");

  pgm.dropType("attribute_kind_t");
}
