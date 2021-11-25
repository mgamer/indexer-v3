import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("fill_events", {
    buy_order_hash: {
      type: "text",
      notNull: true,
    },
    sell_order_hash: {
      type: "text",
      notNull: true,
    },
    maker: {
      type: "text",
      notNull: true,
    },
    taker: {
      type: "text",
      notNull: true,
    },
    price: {
      type: "numeric(78, 0)",
      notNull: true,
    },
    address: {
      type: "text",
      notNull: true,
    },
    block: {
      type: "int",
      notNull: true,
    },
    block_hash: {
      type: "text",
      notNull: true,
    },
    tx_hash: {
      type: "text",
      notNull: true,
    },
    tx_index: {
      type: "int",
      notNull: true,
    },
    log_index: {
      type: "int",
      notNull: true,
    },
  });
  pgm.createConstraint("fill_events", "fill_events_pk", {
    primaryKey: ["block_hash", "tx_hash", "log_index"],
  });

  pgm.createIndex("fill_events", ["tx_hash", "maker"]);

  pgm.createFunction(
    "add_fill_event",
    [
      { name: "kind_arg", type: "order_kind_t" },
      { name: "buy_order_hash_arg", type: "text" },
      { name: "sell_order_hash_arg", type: "text" },
      { name: "maker_arg", type: "text" },
      { name: "taker_arg", type: "text" },
      { name: "price_arg", type: "numeric(78, 0)" },
      { name: "address_arg", type: "text" },
      { name: "block_arg", type: "int" },
      { name: "block_hash_arg", type: "text" },
      { name: "tx_hash_arg", type: "text" },
      { name: "tx_index_arg", type: "int" },
      { name: "log_index_arg", type: "int" },
    ],
    { language: "plpgsql" },
    `
      declare
        "is_new_fill" bool;
      begin
        insert into "fill_events" (
          "buy_order_hash",
          "sell_order_hash",
          "maker",
          "taker",
          "price",
          "address",
          "block",
          "block_hash",
          "tx_hash",
          "tx_index",
          "log_index"
        ) values (
          "buy_order_hash_arg",
          "sell_order_hash_arg",
          "maker_arg",
          "taker_arg",
          "price_arg",
          "address_arg",
          "block_arg",
          "block_hash_arg",
          "tx_hash_arg",
          "tx_index_arg",
          "log_index_arg"
        ) on conflict do nothing returning true into "is_new_fill";

        if "is_new_fill" then
          insert into "orders" (
            "hash",
            "kind",
            "status",
            "side"
          ) values (
            "sell_order_hash_arg",
            "kind_arg",
            'filled',
            'sell'
          ) on conflict ("hash") do update
          set "status" = 'filled';

          insert into "orders" (
            "hash",
            "kind",
            "status",
            "side"
          ) values (
            "buy_order_hash_arg",
            "kind_arg",
            'filled',
            'buy'
          ) on conflict ("hash") do update
          set "status" = 'filled';
        end if;
      end
    `
  );

  pgm.createFunction(
    "remove_fill_events",
    [{ name: "block_hash_arg", type: "text" }],
    { language: "plpgsql" },
    `
      begin
        -- We should also revert the status of the affected orders when
        -- removing fill events. However, that's tricky since we cannot
        -- know what to revert to (eg. 'valid' or 'expired') and it might
        -- also mess up other higher-level order processes. So we simply
        -- skip reverting since there's probably going to be very few
        -- cases when a fill is permanently orphaned (eg. 99.99% of the
        -- time, the fill will be reincluded in a future block).

        delete from "fill_events" where "block_hash" = "block_hash_arg";
      end
    `
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropFunction("remove_fill_events", [
    { name: "block_hash_arg", type: "text" },
  ]);
  pgm.dropFunction("add_fill_event", [
    { name: "kind_arg", type: "order_kind_t" },
    { name: "buy_order_hash_arg", type: "text" },
    { name: "sell_order_hash_arg", type: "text" },
    { name: "maker_arg", type: "text" },
    { name: "taker_arg", type: "text" },
    { name: "price_arg", type: "numeric(78, 0)" },
    { name: "address_arg", type: "text" },
    { name: "block_arg", type: "int" },
    { name: "block_hash_arg", type: "text" },
    { name: "tx_hash_arg", type: "text" },
    { name: "tx_index_arg", type: "int" },
    { name: "log_index_arg", type: "int" },
  ]);

  pgm.dropIndex("fill_events", ["tx_hash", "maker"]);

  pgm.dropTable("fill_events");
}
