import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType("order_status_t", ["valid", "cancelled", "filled"]);

  pgm.createType("sell_order_kind_t", ["wyvern-v2", "punks"]);

  pgm.createTable("sell_orders", {
    hash: {
      type: "text",
      notNull: true,
    },
    kind: {
      type: "sell_order_kind_t",
      notNull: true,
    },
    origin: {
      type: "text",
    },
    contract: {
      type: "text",
      notNull: true,
    },
    token_id: {
      type: "numeric(78, 0)",
      notNull: true,
    },
    maker: {
      type: "text",
      notNull: true,
    },
    taker: {
      type: "text",
    },
    price: {
      type: "numeric(78, 0)",
      notNull: true,
    },
    valid_between: {
      type: "tstzrange",
      notNull: true,
    },
    status: {
      type: "order_status_t",
      notNull: true,
      default: "valid",
    },
    raw_data: {
      type: "JSONB",
    },
  });
  pgm.createConstraint("sell_orders", "sell_orders_pk", {
    primaryKey: ["hash"],
  });

  pgm.createIndex("sell_orders", ["contract", "token_id", "valid_between"], {
    where: `"status" = 'valid'`,
    include: "price",
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex("sell_orders", ["contract", "token_id", "valid_between"]);

  pgm.dropTable("sell_orders");
}
