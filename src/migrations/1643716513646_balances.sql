-- Up Migration

CREATE TABLE "balances" (
  "contract" BYTEA NOT NULL,
  "token_id" NUMERIC(78, 0) NOT NULL,
  "owner" BYTEA NOT NULL,
  "amount" NUMERIC(78, 0) NOT NULL
);

ALTER TABLE "balances"
  ADD CONSTRAINT "balances_pk"
  PRIMARY KEY ("contract", "token_id", "owner");

-- Down Migration

DROP TABLE "balances";