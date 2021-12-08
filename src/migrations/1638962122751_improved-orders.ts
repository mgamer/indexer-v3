import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns("orders", {
    taker: {
      type: "text",
    },
    source_info: {
      type: "jsonb",
    },
    royalty_info: {
      type: "jsonb",
    },
  });

  pgm.addColumns("token_sets", {
    tag: {
      type: "jsonb",
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("token_sets", ["tag"]);

  pgm.dropColumns("orders", ["taker", "source_info", "royalty_info"]);
}
