import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Contracts

  pgm.createType("contract_schema", ["ERC721", "ERC1155"]);

  pgm.createTable("contracts", {
    address: {
      type: "TEXT",
      notNull: true,
    },
    schema: {
      type: "contract_schema",
      notNull: true,
    },
  });

  pgm.createConstraint("contracts", "contracts_pk", {
    primaryKey: ["address"],
  });

  // Tokens

  pgm.createTable("tokens", {
    contract: {
      type: "TEXT",
      notNull: true,
    },
    token_id: {
      type: "NUMERIC(78, 0)",
      notNull: true,
    },
    floor_price: {
      type: "NUMERIC(78, 0)",
    },
    top_bid: {
      type: "NUMERIC(78, 0)",
    },
  });

  pgm.createConstraint("tokens", "tokens_pk", {
    primaryKey: ["contract", "token_id"],
  });
  pgm.createConstraint("tokens", "tokens_contract_fk", {
    foreignKeys: {
      columns: ["contract"],
      references: "contracts(address)",
    },
  });

  // Attributes

  pgm.createTable("attributes", {
    id: {
      type: "SERIAL",
      notNull: true,
    },
    category: {
      type: "TEXT",
      notNull: true,
    },
    key: {
      type: "TEXT",
      notNull: true,
    },
    value: {
      type: "TEXT",
      notNull: true,
    },
  });

  pgm.createConstraint("attributes", "attributes_pk", {
    primaryKey: ["id"],
  });
  pgm.createConstraint("attributes", "attributes_category_key_value_unique", {
    unique: ["category", "key", "value"],
  });

  // Tokens attributes

  pgm.createTable("tokens_attributes", {
    contract: {
      type: "TEXT",
      notNull: true,
    },
    token_id: {
      type: "NUMERIC(78, 0)",
      notNull: true,
    },
    attribute_id: {
      type: "INT",
      notNull: true,
    },
  });

  pgm.createConstraint("tokens_attributes", "tokens_attributes_pk", {
    primaryKey: ["contract", "token_id", "attribute_id"],
  });

  pgm.createConstraint("tokens_attributes", "tokens_attributes_token_fk", {
    foreignKeys: {
      columns: ["contract", "token_id"],
      references: "tokens(contract, token_id)",
    },
  });
  pgm.createConstraint("tokens_attributes", "tokens_attributes_attribute_fk", {
    foreignKeys: {
      columns: ["attribute_id"],
      references: "attributes(id)",
    },
  });

  pgm.createIndex("tokens_attributes", ["attribute_id"]);

  // Views

  pgm.createTable("views", {
    id: {
      type: "SERIAL",
      notNull: true,
    },
    label: {
      type: "TEXT",
      notNull: true,
    },
  });

  pgm.createConstraint("views", "views_pk", {
    primaryKey: ["id"],
  });

  pgm.createIndex("views", ["label"]);

  // Views attributes

  pgm.createTable("views_attributes", {
    view_id: {
      type: "INT",
      notNull: true,
    },
    attribute_id: {
      type: "INT",
      notNull: true,
    },
  });

  pgm.createConstraint("views_attributes", "views_attributes_pk", {
    primaryKey: ["view_id", "attribute_id"],
  });
  pgm.createConstraint("views_attributes", "views_attributes_view_fk", {
    foreignKeys: {
      columns: ["view_id"],
      references: "views(id)",
    },
  });
  pgm.createConstraint("views_attributes", "views_attributes_attribute_fk", {
    foreignKeys: {
      columns: ["attribute_id"],
      references: "attributes(id)",
    },
  });

  pgm.createIndex("views_attributes", ["attribute_id"]);

  // Token single

  pgm.createTable("token_singles", {
    id: {
      type: "SERIAL",
      notNull: true,
    },
    contract: {
      type: "TEXT",
      notNull: true,
    },
    token_id: {
      type: "NUMERIC(78, 0)",
      notNull: true,
    },
  });

  pgm.createConstraint("token_singles", "token_singles_pk", {
    primaryKey: ["id"],
  });
  pgm.createConstraint("token_singles", "token_singles_token_fk", {
    foreignKeys: {
      columns: ["contract", "token_id"],
      references: "tokens(contract, token_id)",
    },
  });

  pgm.createIndex("token_singles", ["contract", "token_id"]);

  // Token ranges

  pgm.createTable("token_ranges", {
    id: {
      type: "SERIAL",
      notNull: true,
    },
    view_id: {
      type: "INT",
      notNull: true,
    },
    contract: {
      type: "TEXT",
      notNull: true,
    },
    token_id_range: {
      type: "NUMRANGE",
      notNull: true,
    },
  });

  pgm.createConstraint("token_ranges", "token_ranges_pk", {
    primaryKey: ["id"],
  });
  pgm.createConstraint("token_ranges", "token_ranges_view_fk", {
    foreignKeys: {
      columns: ["view_id"],
      references: "views(id)",
    },
  });

  pgm.createIndex("token_ranges", ["view_id"]);
  pgm.createIndex("token_ranges", ["contract"]);
  pgm.createIndex("token_ranges", ["token_id_range"], { method: "gist" });

  // Token lists

  pgm.createTable("token_lists", {
    id: {
      type: "TEXT",
      notNull: true,
    },
    view_id: {
      type: "INT",
      notNull: true,
    },
  });

  pgm.createConstraint("token_lists", "token_lists_pk", {
    primaryKey: ["id"],
  });
  pgm.createConstraint("token_lists", "token_lists_view_fk", {
    foreignKeys: {
      columns: ["view_id"],
      references: "views(id)",
    },
  });

  pgm.createIndex("token_lists", ["view_id"]);

  // Token lists tokens

  pgm.createTable("token_lists_tokens", {
    contract: {
      type: "TEXT",
      notNull: true,
    },
    token_id: {
      type: "NUMERIC(78, 0)",
      notNull: true,
    },
    token_list_id: {
      type: "TEXT",
      notNull: true,
    },
  });

  pgm.createConstraint("token_lists_tokens", "token_lists_tokens_pk", {
    primaryKey: ["contract", "token_id", "token_list_id"],
  });
  pgm.createConstraint(
    "token_lists_tokens",
    "token_lists_tokens_token_list_fk",
    {
      foreignKeys: {
        columns: ["token_list_id"],
        references: "token_lists(id)",
      },
    }
  );
  pgm.createConstraint("token_lists_tokens", "token_lists_tokens_token_fk", {
    foreignKeys: {
      columns: ["contract", "token_id"],
      references: "tokens(contract, token_id)",
    },
  });

  pgm.createIndex("token_lists_tokens", ["token_list_id"]);

  // Buy orders

  pgm.createTable("buy_orders", {
    hash: {
      type: "TEXT",
      notNull: true,
    },
    token_single_id: {
      type: "INT",
    },
    token_range_id: {
      type: "INT",
    },
    token_list_id: {
      type: "TEXT",
    },
    price: {
      type: "NUMERIC(78, 0)",
      notNull: true,
    },
  });

  pgm.createConstraint("buy_orders", "buy_orders_pk", {
    primaryKey: ["hash"],
  });
  pgm.createConstraint("buy_orders", "buy_orders_token_single_fk", {
    foreignKeys: {
      columns: ["token_single_id"],
      references: "token_singles(id)",
    },
  });
  pgm.createConstraint("buy_orders", "buy_orders_token_range_fk", {
    foreignKeys: {
      columns: ["token_range_id"],
      references: "token_ranges(id)",
    },
  });
  pgm.createConstraint("buy_orders", "buy_orders_token_list_fk", {
    foreignKeys: {
      columns: ["token_list_id"],
      references: "token_lists(id)",
    },
  });

  pgm.createIndex("buy_orders", ["token_single_id"]);
  pgm.createIndex("buy_orders", ["token_range_id"]);
  pgm.createIndex("buy_orders", ["token_list_id"]);

  // TODO: Partial indexes on valid orders
}

export async function down(pgm: MigrationBuilder): Promise<void> {}
