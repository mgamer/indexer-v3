import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createMaterializedView(
    "collection_stats",
    {
      columns: [
        "collection_id",
        "token_count",
        "on_sale_count",
        "unique_owners_count",
        "sample_image",
        "floor_sell_value",
        "top_buy_value",
      ],
    },
    `
      select
        "t"."collection_id",
        count(distinct("t"."token_id")) as "token_count",
        count(distinct("t"."token_id")) filter (where "t"."floor_sell_value" is not null) as "on_sale_count",
        count(distinct("o"."owner")) filter (where "o"."amount" > 0) AS "unique_owners_count",
        max("t"."image") as "sample_image",
        min("t"."floor_sell_value") as "floor_sell_value",
        max("t"."top_buy_value") as "top_buy_value"
      from "tokens" "t"
      join "ownerships" "o"
        on "t"."contract" = "o"."contract"
        and "t"."token_id" = "o"."token_id"
      group by "t"."collection_id"
    `
  );

  pgm.createIndex("collection_stats", "collection_id", { unique: true });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropMaterializedView("collection_stats", { ifExists: true });
}
