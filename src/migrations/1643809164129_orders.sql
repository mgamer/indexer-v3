-- Up Migration

CREATE TYPE "order_kind_t" AS ENUM (
  'wyvern-v2'
);

CREATE TYPE "order_side_t" AS ENUM (
  'buy',
  'sell'
);

CREATE TYPE "order_fillability_status_t" AS ENUM (
  'fillable',
  'no-balance',
  'cancelled',
  'filled'
);

CREATE TYPE "order_approval_status_t" AS ENUM (
  'approved',
  'no-approval',
  'disabled'
);

CREATE TABLE "orders" (
  "id" TEXT NOT NULL,
  "kind" "order_kind_t" NOT NULL,
  "side" "order_side_t",
  "fillability_status" "order_fillability_status_t",
  "approval_status" "order_approval_status_t",
  "token_set_id" TEXT,
  "token_set_schema_hash" BYTEA,
  "maker" BYTEA,
  "taker" BYTEA,
  "price" NUMERIC(78, 0),
  "value" NUMERIC(78, 0),
  "valid_between" TSTZRANGE,
  "source_info" JSONB,
  "royalty_info" JSONB,
  "raw_data" JSONB,
  "expiration" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ
);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_pk"
  PRIMARY KEY ("id");

CREATE INDEX "orders_token_set_id_side_value_index"
  ON "orders" ("token_set_id", "side", "value")
  INCLUDE ("id", "maker", "valid_between")
  WHERE ("fillability_status" = 'fillable' AND "approval_status" = 'approved');

CREATE INDEX "orders_maker_side_index"
  ON "orders" ("maker", "side")
  INCLUDE ("id")
  WHERE ("fillability_status" = 'fillable' OR "fillability_status" = 'no-balance');

CREATE INDEX "orders_valid_between_index"
  ON "orders" ("valid_between")
  INCLUDE ("id")
  WHERE ("fillability_status" = 'fillable' OR "fillability_status" = 'no-balance');

CREATE INDEX "orders_created_at_id_side_index"
  ON "orders" ("created_at", "id", "side")
  WHERE ("fillability_status" = 'fillable' AND "approval_status" = 'approved');

-- https://www.lob.com/blog/supercharge-your-postgresql-performance
-- https://klotzandrew.com/blog/posgres-per-table-autovacuum-management
ALTER TABLE "orders" SET (autovacuum_vacuum_scale_factor = 0.0);
ALTER TABLE "orders" SET (autovacuum_vacuum_threshold = 5000);
ALTER TABLE "orders" SET (autovacuum_analyze_scale_factor = 0.0);
ALTER TABLE "orders" SET (autovacuum_analyze_threshold = 5000);

-- Down Migration

DROP TABLE "orders";

DROP TYPE "order_approval_status_t";

DROP TYPE "order_fillability_status_t";

DROP TYPE "order_side_t";

DROP TYPE "order_kind_t";