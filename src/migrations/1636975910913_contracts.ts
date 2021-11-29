import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType("contract_kind_t", ["erc721", "erc1155"]);

  pgm.createTable("contracts", {
    address: {
      type: "text",
      notNull: true,
    },
    kind: {
      type: "contract_kind_t",
      notNull: true,
    },
  });
  pgm.createConstraint("contracts", "contracts_pk", {
    primaryKey: ["address"],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("contracts");

  pgm.dropType("contract_kind_t");
}
