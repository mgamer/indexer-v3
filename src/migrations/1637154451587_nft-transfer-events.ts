import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("nft_transfer_events", {
    token_id: {
      type: "numeric(78, 0)",
      notNull: true,
    },
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
  pgm.createConstraint("nft_transfer_events", "nft_transfer_events_pk", {
    primaryKey: ["block_hash", "tx_hash", "log_index"],
  });

  pgm.createIndex("nft_transfer_events", [{ name: "block", sort: "DESC" }]);
  pgm.createIndex("nft_transfer_events", ["tx_hash", "from"]);
  pgm.createIndex("nft_transfer_events", [
    "address",
    { name: "block", sort: "DESC" },
  ]);
  pgm.createIndex("nft_transfer_events", [
    "address",
    "token_id",
    { name: "block", sort: "DESC" },
  ]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("nft_transfer_events");
}
