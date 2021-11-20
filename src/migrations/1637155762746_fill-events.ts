import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("fill_events", {
    contract: {
      type: "text",
      notNull: true,
    },
    buy_order_hash: {
      type: "text",
    },
    sell_order_hash: {
      type: "text",
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

  pgm.createIndex("fill_events", ["contract", "block"]);
  pgm.createIndex("fill_events", ["tx_hash"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex("cancel_events", ["tx_hash"]);
  pgm.dropIndex("cancel_events", ["contract", "block"]);

  pgm.dropTable("cancel_events");
}
