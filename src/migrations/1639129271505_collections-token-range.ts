import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns("collections", {
    contract: {
      type: "text",
    },
    token_id_range: {
      type: "numrange",
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("collections", ["contract", "token_id_range"]);
}
