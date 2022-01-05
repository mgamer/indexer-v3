import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addTypeValue("attribute_kind_t", "range");
  pgm.addTypeValue("attribute_kind_t", "date");

  pgm.addColumns("attributes", {
    rank: {
      type: "integer",
      default: 1,
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("attributes", ["rank"]);
}
