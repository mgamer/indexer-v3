import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addTypeValue("contract_kind_t", "erc20");
  pgm.addTypeValue("contract_kind_t", "wyvern-v2");
}

export async function down(_pgm: MigrationBuilder): Promise<void> {
  // Not possible to remove enum values once added
}
