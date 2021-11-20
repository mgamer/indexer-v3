import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("ownerships", {
    contract: {
      type: "text",
      notNull: true,
    },
    token_id: {
      type: "numeric(78, 0)",
      notNull: true,
    },
    owner: {
      type: "text",
      notNull: true,
    },
    amount: {
      type: "numeric(78, 0)",
      notNull: true,
    },
  });
  pgm.createConstraint("ownerships", "ownerships_pk", {
    primaryKey: ["contract", "token_id", "owner"],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("ownerships");
}
