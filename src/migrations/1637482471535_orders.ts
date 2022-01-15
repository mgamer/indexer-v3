import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType("order_kind_t", ["wyvern-v2"]);
  pgm.createType("order_status_t", [
    "valid",
    "no-balance",
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
    value: {
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

  // TODO: Remove `valid_between` from the `token_set_id` and `maker`
  // indexes. For efficiency we should always rely on `status`.

  // For efficienctly retrieving the floor sell or top bid of
  // any particular token id
  pgm.createIndex("orders", ["token_set_id", "side", "valid_between"], {
    where: `"status" = 'valid'`,
    include: ["value", "price", "hash"],
  });

  // For efficiently retrieving all expired orders that can still
  // get filled (that is, valid orders or no-balance orders)
  pgm.createIndex("orders", ["valid_between"], {
    where: `"status" = 'valid' or "status" = 'no-balance'`,
    include: ["hash"],
  });

  // For efficiently retrieving a maker's both valid and no-balance
  // orders for checking them against the maker's balance in order
  // to revalidate or invalidate
  pgm.createIndex("orders", ["maker", "side", "valid_between"], {
    where: `"status" = 'valid' or "status" = 'no-balance'`,
    include: ["hash"],
  });

  pgm.addColumns("tokens", {
    floor_sell_hash: {
      type: "text",
    },
    floor_sell_value: {
      type: "numeric(78, 0)",
    },
    top_buy_hash: {
      type: "text",
    },
    top_buy_value: {
      type: "numeric(78, 0)",
    },
  });

  pgm.createIndex("tokens", ["floor_sell_hash"]);
  pgm.createIndex("tokens", ["contract", "floor_sell_value"]);
  pgm.createIndex("tokens", ["contract", "token_id", "floor_sell_value"]);
  pgm.createIndex("tokens", ["top_buy_hash"]);
  pgm.createIndex("tokens", ["contract", "top_buy_value"]);
  pgm.createIndex("tokens", ["contract", "token_id", "top_buy_value"]);

  // References:
  // - https://www.lob.com/blog/supercharge-your-postgresql-performance
  // - https://klotzandrew.com/blog/posgres-per-table-autovacuum-management
  pgm.sql(`alter table "tokens" set (autovacuum_vacuum_scale_factor = 0.0)`);
  pgm.sql(`alter table "tokens" set (autovacuum_vacuum_threshold = 5000)`);
  pgm.sql(`alter table "tokens" set (autovacuum_analyze_scale_factor = 0.0)`);
  pgm.sql(`alter table "tokens" set (autovacuum_analyze_threshold = 5000)`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("tokens", [
    "floor_sell_hash",
    "floor_sell_value",
    "top_buy_hash",
    "top_buy_value",
  ]);

  pgm.dropTable("orders");

  pgm.dropType("order_side_t");
  pgm.dropType("order_status_t");
  pgm.dropType("order_kind_t");
}
