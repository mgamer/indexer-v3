-- Up Migration

CREATE TABLE "transfer_validator_eoas" (
  "validator" BYTEA NOT NULL,
  "address" BYTEA NOT NULL
);

ALTER TABLE "transfer_validator_eoas"
  ADD CONSTRAINT "transfer_validator_eoas_pk"
  PRIMARY KEY ("validator", "address");

-- Down Migration

DROP TABLE "transfer_validator_eoas";