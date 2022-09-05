-- Up Migration

CREATE TABLE "sudoswap_pools" (
  "pool_contract" BYTEA NOT NULL,
  "nft_contract" BYTEA NOT NULL,
  "token_contract" BYTEA NOT NULL,
  "bonding_curve_contract" BYTEA NOT NULL,
  "pool_kind" SMALLINT NOT NULL,
  "pair_kind" SMALLINT NOT NULL
);

ALTER TABLE "sudoswap_pools"
  ADD CONSTRAINT "sudoswap_pools_pk"
  PRIMARY KEY ("pool_contract");

-- Down Migration

DROP TABLE "sudoswap_pools";