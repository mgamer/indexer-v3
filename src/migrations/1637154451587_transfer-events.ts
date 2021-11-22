import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("transfer_events", {
    token_id: {
      type: "numeric(78, 0)",
      notNull: true,
    },
    amount: {
      type: "numeric(78, 0)",
      notNull: true,
    },
    from: {
      type: "text",
      notNull: true,
    },
    to: {
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
  pgm.createConstraint("transfer_events", "transfer_events_pk", {
    primaryKey: ["block_hash", "tx_hash", "log_index"],
  });

  pgm.createIndex("transfer_events", ["address", "block"]);
  pgm.createIndex("transfer_events", ["tx_hash"]);

  pgm.createFunction(
    "add_transfer_event",
    [
      { name: "kind_arg", type: "contract_kind_t" },
      { name: "token_id_arg", type: "numeric(78, 0)" },
      { name: "from_arg", type: "text" },
      { name: "to_arg", type: "text" },
      { name: "amount_arg", type: "numeric(78, 0)" },
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
        "is_new_transfer" bool;
      begin
        insert into "transfer_events" (
          "token_id",
          "amount",
          "from",
          "to",
          "address",
          "block",
          "block_hash",
          "tx_hash",
          "tx_index",
          "log_index"
        ) values (
          "token_id_arg",
          "amount_arg",
          "from_arg",
          "to_arg",
          "address_arg",
          "block_arg",
          "block_hash_arg",
          "tx_hash_arg",
          "tx_index_arg",
          "log_index_arg"
        ) on conflict do nothing returning true into "is_new_transfer";

        if is_new_transfer then
          insert into "contracts" (
            "address",
            "kind"
          ) values (
            "address_arg",
            "kind_arg"
          ) on conflict do nothing;

          insert into "tokens" (
            "contract",
            "token_id"
          ) values (
            "address_arg",
            "token_id_arg"
          ) on conflict do nothing;

          insert into "ownerships" (
            "contract",
            "token_id",
            "owner",
            "amount"
          ) values (
            "address_arg",
            "token_id_arg",
            "from_arg",
            -"amount_arg"
          ) on conflict ("contract", "token_id", "owner") do update
          set "amount" = "ownerships"."amount" - "amount_arg";

          insert into "ownerships" (
            "contract",
            "token_id",
            "owner",
            "amount"
          ) values (
            "address_arg",
            "token_id_arg",
            "to_arg",
            "amount_arg"
          ) on conflict ("contract", "token_id", "owner") do update
          set "amount" = "ownerships"."amount" + "amount_arg";
        end if;
      end
    `
  );

  pgm.createFunction(
    "remove_transfer_events",
    [{ name: "block_hash_arg", type: "text" }],
    { language: "plpgsql" },
    `
      declare
        "deleted_transfer_event" transfer_events%rowtype;
      begin
        for "deleted_transfer_event" in
          delete from "transfer_events" where "block_hash" = "block_hash_arg" returning *
        loop
          update "ownerships" set "amount" = "amount" + "deleted_transfer_event"."amount"
          where "contract" = "deleted_transfer_event"."address"
            and "token_id" = "deleted_transfer_event"."token_id"
            and "owner" = "deleted_transfer_event"."from";

          update "ownerships" set "amount" = "amount" - "deleted_transfer_event"."amount"
          where "contract" = "deleted_transfer_event"."address"
            and "token_id" = "deleted_transfer_event"."token_id"
            and "owner" = "deleted_transfer_event"."to";
        end loop;
      end
    `
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropFunction("remove_transfer_events", [
    { name: "block_hash_arg", type: "text" },
  ]);
  pgm.dropFunction("add_transfer_event", [
    { name: "kind_arg", type: "contract_kind_t" },
    { name: "token_id_arg", type: "numeric(78, 0)" },
    { name: "amount_arg", type: "numeric(78, 0)" },
    { name: "from_arg", type: "text" },
    { name: "address_arg", type: "text" },
    { name: "block_arg", type: "int" },
    { name: "block_hash_arg", type: "text" },
    { name: "tx_hash_arg", type: "text" },
    { name: "tx_index_arg", type: "int" },
    { name: "log_index_arg", type: "int" },
  ]);

  pgm.dropIndex("transfer_events", ["tx_hash"]);
  pgm.dropIndex("transfer_events", ["address", "block"]);

  pgm.dropTable("transfer_events");
}
