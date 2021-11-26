import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("cancel_events", {
    order_hash: {
      type: "text",
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
  pgm.createConstraint("cancel_events", "cancel_events_pk", {
    primaryKey: ["block_hash", "tx_hash", "log_index"],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("cancel_events");
}
