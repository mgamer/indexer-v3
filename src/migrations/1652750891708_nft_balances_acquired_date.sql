-- Up Migration

ALTER TABLE nft_balances
ADD COLUMN acquired_at TIMESTAMPTZ;

-- Down Migration

ALTER TABLE nft_balances
DROP COLUMN acquired_at;
