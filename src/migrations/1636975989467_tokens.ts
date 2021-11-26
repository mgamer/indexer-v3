import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("tokens", {
    contract: {
      type: "text",
      notNull: true,
    },
    token_id: {
      type: "numeric(78, 0)",
      notNull: true,
    },
  });
  pgm.createConstraint("tokens", "tokens_pk", {
    primaryKey: ["contract", "token_id"],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("tokens");
}
