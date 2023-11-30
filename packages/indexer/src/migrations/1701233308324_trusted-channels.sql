-- Up Migration

CREATE TABLE "trusted_channels" (
  "contract" BYTEA NOT NULL,
  "channel" BYTEA NOT NULL
);

ALTER TABLE "trusted_channels"
  ADD CONSTRAINT "trusted_channels_pk"
  PRIMARY KEY ("contract", "channel");

-- Down Migration

DROP TABLE "trusted_channels";