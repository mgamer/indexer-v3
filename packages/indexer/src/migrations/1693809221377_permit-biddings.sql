-- Up Migration

CREATE TABLE "permit_biddings" (
    "id" TEXT NOT NULL,
    "owner" BYTEA NOT NULL, 
    "spender" BYTEA NOT NULL, 
    "value" NUMERIC(78, 0),
    "nonce" NUMERIC(78, 0),
    "deadline" NUMERIC(78, 0),
    "signature" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "orders" ADD COLUMN "permit_id" TEXT;

ALTER TABLE "permit_biddings"
  ADD CONSTRAINT "permit_biddings_pk"
  PRIMARY KEY ("id");

CREATE INDEX "permit_biddings_owner_nonce_deadline_full_index"
  ON "permit_biddings" ("owner", "nonce", "deadline");

CREATE INDEX "orders_permit_id_index"
  ON "orders" ("permit_id");

-- Down Migration

DROP TABLE "permit_biddings";

ALTER TABLE "orders" DROP COLUMN "permit_id";

DROP INDEX "orders_permit_id_index";