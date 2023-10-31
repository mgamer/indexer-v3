-- Up Migration

CREATE TABLE "actions_tracking" (
  "id" BIGSERIAL NOT NULL,
  "context" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "action_taker_identifier" TEXT NOT NULL,
  "contract" BYTEA,
  "collection_id" TEXT,
  "token_id" NUMERIC(78, 0),
  "data" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "actions_tracking"
  ADD CONSTRAINT "actions_tracking_pk"
  PRIMARY KEY ("id");

CREATE INDEX "actions_tracking_context_collection_id_created_at"
  ON "actions_tracking" ("context", "collection_id", "created_at");

CREATE INDEX "actions_tracking_context_contract_token_id_created_at"
  ON "actions_tracking" ("context", "contract", "token_id", "created_at");

CREATE INDEX "actions_tracking_action_taker_identifier_created_at"
  ON "actions_tracking" ("action_taker_identifier", "created_at");

-- Down Migration

DROP TABLE "actions_tracking";