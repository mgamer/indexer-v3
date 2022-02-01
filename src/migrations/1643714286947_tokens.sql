-- Up Migration

CREATE TABLE "tokens" (
  "contract" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "tokens"
  ADD CONSTRAINT "tokens_pk"
  PRIMARY KEY ("contract", "token_id");

-- Down Migration

DROP TABLE "tokens";