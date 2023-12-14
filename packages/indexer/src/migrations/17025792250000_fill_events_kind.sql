-- Up Migration
CREATE TYPE "fill_event_kind" AS ENUM (
  'mint',
  'transfer',
  'burn',
  'airdrop',
  'sale',
);

ALTER TYPE "fill_events_2" ADD COLUMN "kind" "fill_event_kind" DEFAULT 'mint';

-- Down Migration

ALTER TYPE "fill_events_2" DROP COLUMN "kind";