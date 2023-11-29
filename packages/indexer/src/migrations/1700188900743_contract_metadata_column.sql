-- Up Migration

ALTER TABLE contracts ADD COLUMN metadata JSONB

-- Down Migration

ALTER TABLE contracts DROP COLUMN metadata

