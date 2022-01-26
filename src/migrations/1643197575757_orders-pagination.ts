import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns("orders", {
    created_at: {
      type: "timestamptz",
    },
  });

  pgm.createIndex("orders", ["created_at", "hash", "side"], {
    where: `"status" = 'valid'`,
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex("orders", ["created_at", "hash"]);

  pgm.dropColumns("orders", ["created_at"]);
}
