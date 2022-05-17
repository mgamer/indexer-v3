-- Up Migration

ALTER TABLE nft_balances
ADD COLUMN acquired_at TIMESTAMPTZ;

CREATE INDEX "nft_balances_owner_acquired_at_index"
  ON "nft_balances" ("owner", "acquired_at" DESC NULLS LAST)
  WHERE ("amount" > 0);

-- Down Migration

ALTER TABLE nft_balances
DROP COLUMN acquired_at;

DROP INDEX nft_balances_owner_acquired_at_index;
