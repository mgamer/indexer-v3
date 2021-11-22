import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType("order_kind_t", ["wyvern-v2"]);
  pgm.createType("order_status_t", [
    "valid",
    "invalid",
    "cancelled",
    "filled",
    "expired",
  ]);
  pgm.createType("order_side_t", ["buy", "sell"]);

  pgm.createTable("orders", {
    hash: {
      type: "text",
      notNull: true,
    },
    kind: {
      type: "order_kind_t",
      notNull: true,
    },
    status: {
      type: "order_status_t",
      notNull: true,
      default: "valid",
    },
    side: {
      type: "order_side_t",
    },
    token_set_id: {
      type: "text",
    },
    maker: {
      type: "text",
    },
    price: {
      type: "numeric(78, 0)",
    },
    valid_between: {
      type: "tstzrange",
    },
    raw_data: {
      type: "jsonb",
    },
  });
  pgm.createConstraint("orders", "orders_pk", {
    primaryKey: ["hash"],
  });
  pgm.createConstraint("orders", "orders_token_set_fk", {
    foreignKeys: {
      columns: ["token_set_id"],
      references: "token_sets(id)",
    },
  });

  pgm.createIndex("orders", ["token_set_id", "side", "valid_between"], {
    where: `"status" = 'valid'`,
    include: ["price", "hash"],
  });
  pgm.createIndex("orders", ["valid_between"], {
    where: `"status" = 'valid'`,
    include: ["hash"],
  });
  pgm.createIndex("orders", ["maker"], {
    where: `"status" = 'valid'`,
    include: ["hash"],
  });
  // TODO: Investigate indexes

  pgm.addColumns("tokens", {
    floor_sell_hash: {
      type: "text",
    },
    floor_sell_price: {
      type: "numeric(78, 0)",
    },
    top_buy_hash: {
      type: "text",
    },
    top_buy_price: {
      type: "numeric(78, 0)",
    },
  });
  pgm.createConstraint("tokens", "tokens_floor_sell_fk", {
    foreignKeys: {
      columns: ["floor_sell_hash"],
      references: "orders(hash)",
    },
  });
  pgm.createConstraint("tokens", "tokens_top_buy_fk", {
    foreignKeys: {
      columns: ["top_buy_hash"],
      references: "orders(hash)",
    },
  });

  pgm.createIndex("tokens", ["floor_sell_hash"]);
  pgm.createIndex("tokens", ["floor_sell_price"]);
  pgm.createIndex("tokens", ["top_buy_hash"]);
  pgm.createIndex("tokens", ["top_buy_price"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex("tokens", ["top_buy_price"]);
  pgm.dropIndex("tokens", ["top_buy_hash"]);
  pgm.dropIndex("tokens", ["floor_sell_price"]);
  pgm.dropIndex("tokens", ["floor_sell_hash"]);

  pgm.dropColumns("tokens", [
    "floor_sell_hash",
    "floor_sell_price",
    "top_buy_hash",
    "top_buy_price",
  ]);

  pgm.dropIndex("orders", ["valid_between"]);
  pgm.dropIndex("orders", ["token_set_id", "side", "valid_between"]);

  pgm.dropTable("orders");

  pgm.dropType("order_side_t");
  pgm.dropType("order_status_t");
  pgm.dropType("order_kind_t");
}
