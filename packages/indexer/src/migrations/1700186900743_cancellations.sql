-- Up Migration

CREATE TABLE "cancellations" (
  "order_id" TEXT,
  "owner" BYTEA NOT NULL,
  "timestamp" INT NOT NULL,
  "order_kind" order_kind_t NOT NULL
);

ALTER TABLE "cancellations"
  ADD CONSTRAINT "cancellations_pk"
  PRIMARY KEY ("order_id");

-- Down Migration

DROP TABLE "cancellations";