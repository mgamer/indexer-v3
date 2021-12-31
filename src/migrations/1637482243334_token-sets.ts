import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("token_sets", {
    id: {
      type: "text",
      notNull: true,
    },
  });
  pgm.createConstraint("token_sets", "token_sets_pk", {
    primaryKey: ["id"],
  });

  pgm.createTable("token_sets_tokens", {
    token_set_id: {
      type: "text",
      notNull: true,
    },
    contract: {
      type: "text",
      notNull: true,
    },
    token_id: {
      type: "numeric(78, 0)",
      notNull: true,
    },
  });
  pgm.createConstraint("token_sets_tokens", "token_sets_tokens_pk", {
    primaryKey: ["token_set_id", "contract", "token_id"],
  });

  pgm.createIndex("token_sets_tokens", ["contract", "token_id"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("token_sets_tokens");

  pgm.dropTable("token_sets");
}
