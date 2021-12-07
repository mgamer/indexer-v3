import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("blocks", {
    block: {
      type: "int",
      notNull: true,
    },
    timestamp: {
      type: "int",
      notNull: true,
    },
  });

  pgm.createConstraint("blocks", "blocks_pk", {
    primaryKey: "block",
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("blocks");
}
