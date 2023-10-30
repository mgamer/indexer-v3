-- Up Migration

CREATE TABLE "actions_tracking" (
  "id" BIGSERIAL NOT NULL,
  "context" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "action_taker_identifier" TEXT NOT NULL,
  "data" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "actions_tracking"
  ADD CONSTRAINT "actions_tracking"
  PRIMARY KEY ("id");

CREATE INDEX "actions_tracking_context_created_at"
  ON "actions_tracking"("context", "created_at");

CREATE INDEX "actions_tracking_action_taker_identifier_created_at"
  ON "actions_tracking"("action_taker_identifier", "created_at");

-- Down Migration

DROP TABLE "actions_tracking";