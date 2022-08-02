-- Up Migration

CREATE TABLE "currencies" (
  "contract" BYTEA NOT NULL,
  "name" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "decimals" SMALLINT NOT NULL,
  "metadata" JSONB
);

ALTER TABLE "currencies"
  ADD CONSTRAINT "currencies_pk"
  PRIMARY KEY ("currencies");

CREATE TABLE "usd_prices" (
  "currency" BYTEA NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL,
  "value" NUMERIC NOT NULL
);

ALTER TABLE "usd_prices"
  ADD CONSTRAINT ("usd_prices_pk")
  PRIMARY KEY ("currency", "timestamp");

ALTER TABLE "fill_events_2" ADD COLUMN "currency" BYTEA NOT NULL DEFAULT ('\x0000000000000000000000000000000000000000');
ALTER TABLE "fill_events_2" ADD COLUMN "currency_price" NUMERIC;
ALTER TABLE "fill_events_2" ADD COLUMN "usdc_price" NUMERIC;

-- Down Migration

ALTER TABLE "fill_events_2" DROP COLUMN "usdc_price";
ALTER TABLE "fill_events_2" DROP COLUMN "currency_price";
ALTER TABLE "fill_events_2" DROP COLUMN "currency";

DROP TABLE "prices";

DROP TABLE "currencies";