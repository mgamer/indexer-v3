import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("fill_events", {
    buy_order_hash: {
      type: "text",
      notNull: true,
    },
    sell_order_hash: {
      type: "text",
      notNull: true,
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
    log_index: {
      type: "int",
      notNull: true,
    },
  });
  pgm.createConstraint("fill_events", "fill_events_pk", {
    primaryKey: ["block_hash", "tx_hash", "log_index"],
  });

  pgm.createIndex("fill_events", [{ name: "block", sort: "DESC" }]);
  pgm.createIndex("fill_events", ["tx_hash", "maker"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("fill_events");
}
