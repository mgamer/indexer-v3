-- Up Migration

CREATE TABLE "s3_export_data_sources" (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  cursor TEXT,
  sequence_number INT NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT NOW(),
);

CREATE UNIQUE INDEX "s3_export_data_sources_kind_unique_index"
  ON "s3_export_data_sources" ("kind");

-- Down Migration

DROP TABLE "s3_export_data_sources";