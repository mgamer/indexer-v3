-- Up Migration

CREATE TABLE "payment_processor_v2_nonces" (
  "maker" BYTEA NOT NULL,
  "marketplace" BYTEA NOT NULL,
  "nonce" NUMERIC(78, 0)
);

ALTER TABLE "payment_processor_v2_nonces"
  ADD CONSTRAINT "payment_processor_v2_nonces_pk"
  PRIMARY KEY ("maker", "marketplace");


CREATE TABLE "payment_processor_v2_marketplaces" (
  "id" BIGSERIAL,
  "marketplace" BYTEA NOT NULL
);

ALTER TABLE "payment_processor_v2_marketplaces"
  ADD CONSTRAINT "payment_processor_v2_marketplaces_pk"
  PRIMARY KEY ("id", "marketplace");

-- Down Migration

DROP TABLE "payment_processor_v2_nonces";
DROP TABLE "payment_processor_v2_marketplaces";