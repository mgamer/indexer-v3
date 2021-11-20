import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("cancel_events", {
    contract: {
      type: "text",
      notNull: true,
    },
    order_hash: {
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
  pgm.createConstraint("cancel_events", "cancel_events_pk", {
    primaryKey: ["block_hash", "tx_hash", "log_index"],
  });

  pgm.createIndex("cancel_events", ["contract", "block"]);
  pgm.createIndex("cancel_events", ["tx_hash"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex("cancel_events", ["tx_hash"]);
  pgm.dropIndex("cancel_events", ["contract", "block"]);

  pgm.dropTable("cancel_events");
}
