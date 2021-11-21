import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType("order_kind_t", ["wyvern-v2"]);
  pgm.createType("order_status_t", ["valid", "expired", "cancelled", "filled"]);

  pgm.createTable("sell_orders", {
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
    contract: {
      type: "text",
    },
    token_id: {
      type: "numeric(78, 0)",
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
  pgm.createConstraint("sell_orders", "sell_orders_pk", {
    primaryKey: ["hash"],
  });

  pgm.createIndex("sell_orders", ["contract", "token_id", "valid_between"], {
    where: `"status" = 'valid'`,
    include: ["price"],
  });
  pgm.createIndex("sell_orders", ["valid_between"], {
    where: `"status" = 'valid'`,
    include: ["contract", "token_id"],
  });

  pgm.addColumns("tokens", {
    floor_sell_hash: {
      type: "text",
    },
    floor_sell_price: {
      type: "numeric(78, 0)",
    },
  });
  pgm.createConstraint("tokens", "tokens_floor_sell_fk", {
    foreignKeys: {
      columns: ["floor_sell_hash"],
      references: "sell_orders(hash)",
    },
  });

  pgm.createIndex("tokens", ["floor_sell_hash"]);
  pgm.createIndex("tokens", ["floor_sell_price"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex("sell_orders", ["contract", "token_id", "valid_between"]);

  pgm.dropTable("sell_orders");

  pgm.dropType("order_status_t");
  pgm.dropType("order_kind_t");
}
