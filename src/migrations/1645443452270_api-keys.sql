-- Up Migration

CREATE TABLE "api_keys" (
  "key" TEXT NOT NULL,
  "app_name" TEXT NOT NULL,
  "website" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);

-- Down Migration

DROP TABLE "api_keys";
