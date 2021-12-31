import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("ft_transfer_events", {
    amount: {
      type: "numeric(78, 0)",
      notNull: true,
    },
    from: {
      type: "text",
      notNull: true,
    },
    to: {
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
    log_index: {
      type: "int",
      notNull: true,
    },
  });
  pgm.createConstraint("ft_transfer_events", "ft_transfer_events_pk", {
    primaryKey: ["block_hash", "tx_hash", "log_index"],
  });

  pgm.createIndex("ft_transfer_events", ["block"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("ft_transfer_events");
}
