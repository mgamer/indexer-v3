-- Up Migration

CREATE TABLE "erc721c_v2_configs" (
  "contract" BYTEA NOT NULL,
  "transfer_validator" BYTEA NOT NULL, 
  "transfer_security_level" SMALLINT NOT NULL,
  "list_id" INT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "erc721c_v2_configs"
  ADD CONSTRAINT "erc721c_v2_configs_pk"
  PRIMARY KEY ("contract");

CREATE INDEX "erc721c_v2_configs_transfer_validator_index"
  ON "erc721c_v2_configs" ("transfer_validator");


CREATE TABLE "erc721c_v2_whitelists" (
  "transfer_validator" BYTEA NOT NULL,
  "id" INT NOT NULL,
  "whitelist" JSONB NOT NULL
);

ALTER TABLE "erc721c_v2_whitelists"
  ADD CONSTRAINT "erc721c_v2_whitelists_pk"
  PRIMARY KEY ("transfer_validator", "id");

CREATE TABLE "erc721c_v2_blacklist" (
  "transfer_validator" BYTEA NOT NULL,
  "id" INT NOT NULL,
  "blacklist" JSONB NOT NULL
);

ALTER TABLE "erc721c_v2_blacklist"
  ADD CONSTRAINT "erc721c_v2_blacklist_pk"
  PRIMARY KEY ("transfer_validator", "id");

-- Down Migration

DROP TABLE "erc721c_v2_configs";

DROP TABLE "erc721c_v2_whitelists";

DROP TABLE "erc721c_v2_blacklist";
