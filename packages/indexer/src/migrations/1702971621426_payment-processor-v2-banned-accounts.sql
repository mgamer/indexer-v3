-- Up Migration

CREATE TABLE "payment_processor_v2_banned_accounts" (
  "contract" BYTEA NOT NULL,
  "account" BYTEA NOT NULL
);

ALTER TABLE "payment_processor_v2_banned_accounts"
  ADD CONSTRAINT "payment_processor_v2_banned_accounts_pk"
  PRIMARY KEY ("contract", "account");

-- Down Migration

DROP TABLE "payment_processor_v2_banned_accounts";