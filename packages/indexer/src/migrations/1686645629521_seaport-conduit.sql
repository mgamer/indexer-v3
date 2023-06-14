-- Up Migration

CREATE TABLE "seaport_conduits" (
  "conduit_key" BYTEA NOT NULL,
  "conduit" BYTEA NOT NULL,
  "tx_hash" BYTEA NOT NULL,
  "channels" JSONB
);

ALTER TABLE "seaport_conduits"
  ADD CONSTRAINT "seaport_conduits_pk"
  PRIMARY KEY ("conduit_key");

CREATE INDEX "seaport_conduits_conduit_index"
  ON "seaport_conduits" ("conduit");

-- Down Migration

DROP TABLE "seaport_conduits";