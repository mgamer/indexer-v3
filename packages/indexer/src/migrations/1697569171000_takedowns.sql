-- Up Migration

CREATE TYPE "takedown_type_t" AS ENUM (
  'collection',
  'token'
);

CREATE TABLE "takedowns" (  
  "id" TEXT NOT NULL,
  "type" "takedown_type_t" NOT NULL,  
  "api_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE "takedowns"
  ADD CONSTRAINT "takedowns_pk"
  PRIMARY KEY ("id", "type");

-- Down Migration

DROP TABLE "takedowns";

DROP TYPE "takedown_type_t";
