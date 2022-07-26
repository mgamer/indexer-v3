-- Up Migration

ALTER TABLE "fill_events_2" ADD COLUMN  "wash_trading_score" DOUBLE PRECISION;

-- Down Migration

ALTER TABLE "fill_events_2" DROP COLUMN "wash_trading_score";
