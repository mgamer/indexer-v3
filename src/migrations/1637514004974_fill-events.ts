import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("fill_events", {
    buy_order_hash: {
      type: "numeric(78, 0)",
    },
    sell_order_hash: {
      type: "numeric(78, 0)",
    },
    maker: {
      type: "text",
      notNull: true,
    },
    taker: {
      type: "text",
      notNull: true,
    },
    price: {
      type: "numeric(78, 0)",
      notNull: true,
    },
    address: {
      type: "text",
      notNull: true,
    },
    block: {
      type: "int",
      notNull: true,
    },
    block_hash: {
      type: "text",
      notNull: true,
    },
    tx_hash: {
      type: "text",
      notNull: true,
    },
    tx_index: {
      type: "int",
      notNull: true,
    },
    log_index: {
      type: "int",
      notNull: true,
    },
  });
  pgm.createConstraint("fill_events", "fill_events_pk", {
    primaryKey: ["block_hash", "tx_hash", "log_index"],
  });

  pgm.createIndex("fill_events", ["buy_order_hash"]);
  pgm.createIndex("fill_events", ["sell_order_hash"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex("fill_events", ["sell_order_hash"]);
  pgm.dropIndex("fill_events", ["buy_order_hash"]);

  pgm.dropTable("fill_events");
}
