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

  pgm.createIndex("ownerships", ["owner", "contract", "token_id"]);

  // References:
  // - https://www.lob.com/blog/supercharge-your-postgresql-performance
  // - https://klotzandrew.com/blog/posgres-per-table-autovacuum-management
  pgm.sql(`alter table "tokens" set (autovacuum_vacuum_scale_factor = 0.0)`);
  pgm.sql(`alter table "tokens" set (autovacuum_vacuum_threshold = 5000)`);
  pgm.sql(`alter table "tokens" set (autovacuum_analyze_scale_factor = 0.0)`);
  pgm.sql(`alter table "tokens" set (autovacuum_analyze_threshold = 5000)`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("ownerships");
}
