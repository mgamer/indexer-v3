-- Up Migration

CREATE INDEX "fill_events_2_contract_price_index"
  ON "fill_events_2" ("contract", "price");

-- Down Migration
