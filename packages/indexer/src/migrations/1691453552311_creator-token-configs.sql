-- Up Migration

CREATE TABLE "creator_token_configs" (
  "collection" BYTEA NOT NULL,
  "transfer_validator" BYTEA NOT NULL, 
  "transfer_security_level" SMALLINT NOT NULL,
  "operator_whitelist_id" INT NOT NULL,
  "permitted_contract_receivers_id" INT NOT NULL,
  "whitelisted_operators" JSONB,
  "permitted_contract_receivers" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "creator_token_configs"
  ADD CONSTRAINT "creator_token_configs_pk"
  PRIMARY KEY ("collection");

CREATE INDEX "creator_token_configs_transfer_validator_permitted_contract_receivers_id_operator_whitelist_id_index"
  ON "creator_token_configs" ("transfer_validator", "permitted_contract_receivers_id", "operator_whitelist_id");

-- Down Migration

DROP TABLE "creator_token_configs";