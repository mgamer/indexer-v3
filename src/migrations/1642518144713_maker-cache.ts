import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns("tokens", {
    floor_sell_maker: {
      type: "text",
    },
    top_buy_maker: {
      type: "text",
    },
  });

  pgm.addColumns("token_sets", {
    top_buy_maker: {
      type: "text",
    },
  });

  // TODO: We might need to index `tokens` `floor_sell_maker`
  // TODO: We might need to index `token_sets` `top_buy_maker`
  pgm.createIndex("tokens", ["top_buy_maker"]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("token_sets", ["top_buy_maker"]);
  pgm.dropColumns("tokens", ["floor_sell_maker", "top_buy_maker"]);
}
