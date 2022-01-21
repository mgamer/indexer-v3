import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addTypeValue("order_status_t", "disabled");
}

export async function down(_pgm: MigrationBuilder): Promise<void> {
  // Not possible to remove enum values once added
}
