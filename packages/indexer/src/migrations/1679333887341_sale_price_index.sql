-- Up Migration

CREATE INDEX "sale_price_index"
  ON "fill_events_2" ("price");

-- Down Migration
