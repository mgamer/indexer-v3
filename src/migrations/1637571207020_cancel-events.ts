import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("cancel_events", {
    order_hash: {
      type: "text",
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
  pgm.createConstraint("cancel_events", "cancel_events_pk", {
    primaryKey: ["block_hash", "tx_hash", "log_index"],
  });

  pgm.createFunction(
    "add_cancel_event",
    [
      { name: "kind_arg", type: "order_kind_t" },
      { name: "order_hash_arg", type: "text" },
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
        "is_new_cancel" bool;
      begin
        insert into "cancel_events" (
          "order_hash",
          "address",
          "block",
          "block_hash",
          "tx_hash",
          "tx_index",
          "log_index"
        ) values (
          "order_hash_arg",
          "address_arg",
          "block_arg",
          "block_hash_arg",
          "tx_hash_arg",
          "tx_index_arg",
          "log_index_arg"
        ) on conflict do nothing returning true into "is_new_cancel";

        if "is_new_cancel" then
          insert into "orders" (
            "hash",
            "kind",
            "status"
          ) values (
            "order_hash_arg",
            "kind_arg",
            'cancelled'
          ) on conflict ("hash") do update
          set "status" = 'cancelled';
        end if;
      end
    `
  );

  pgm.createFunction(
    "remove_cancel_events",
    [{ name: "block_hash_arg", type: "text" }],
    { language: "plpgsql" },
    `
      begin
        -- We should also revert the status of the affected orders when
        -- removing cancel events. However, that's tricky since we cannot
        -- know what to revert to (eg. 'valid' or 'expired') and it might
        -- also mess up other higher-level order processes. So we simply
        -- skip reverting since there's probably going to be very few
        -- cases when a cancel is permanently orphaned (eg. 99.99% of the
        -- time, the cancel will be reincluded in a future block).

        delete from "cancel_events" where "block_hash" = "block_hash_arg";
      end
    `
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropFunction("remove_cancel_events", [
    { name: "block_hash_arg", type: "text" },
  ]);
  pgm.dropFunction("add_cancel_event", [
    { name: "kind_arg", type: "order_kind_t" },
    { name: "order_hash_arg", type: "text" },
    { name: "address_arg", type: "text" },
    { name: "block_arg", type: "int" },
    { name: "block_hash_arg", type: "text" },
    { name: "tx_hash_arg", type: "text" },
    { name: "tx_index_arg", type: "int" },
    { name: "log_index_arg", type: "int" },
  ]);

  pgm.dropTable("cancel_events");
}
