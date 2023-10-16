-- Up Migration

CREATE TYPE "permit_kind_t" AS ENUM (
  'eip2612',
  'permit2'
);

CREATE TABLE "permits" (
    "id" TEXT NOT NULL,
    "kind" "permit_kind_t" NOT NULL,
    "index" INT NOT NULL,
    "token" BYTEA NOT NULL,
    "owner" BYTEA NOT NULL, 
    "spender" BYTEA NOT NULL, 
    "value" NUMERIC(78, 0),
    "nonce" INT,
    "deadline" INT,
    "signature" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "permits"
  ADD CONSTRAINT "permits_pk"
  PRIMARY KEY ("id");

CREATE INDEX "permits_token_spender_owner_nonce_deadline_full_index"
  ON "permits" ("token", "spender", "owner", "nonce", "deadline");

-- Down Migration

DROP TABLE "permits";
DROP TYPE "permit_kind_t";