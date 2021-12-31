import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns("tokens", {
    last_buy_block: {
      type: "int",
    },
    last_buy_value: {
      type: "numeric(78, 0)",
    },
    last_sell_block: {
      type: "int",
    },
    last_sell_value: {
      type: "numeric(78, 0)",
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("tokens", [
    "last_buy_block",
    "last_buy_value",
    "last_sell_block",
    "last_sell_value",
  ]);
}
