-- Up Migration

CREATE TABLE "cosign_keys" (
  "signer" BYTEA NOT NULL,
  "endpoint" TEXT,
  "api_key" TEXT,
  "creator" TEXT
);

ALTER TABLE "cosign_keys"
  ADD CONSTRAINT "cosign_keys_pk"
  PRIMARY KEY ("signer");

-- Down Migration

DROP TABLE "cosign_keys";
