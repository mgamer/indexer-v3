-- Up Migration

CREATE TABLE "fee_recipients" (
  "id" SERIAL PRIMARY KEY,
  "address" TEXT NOT NULL,
  "domain" TEXT
);

CREATE INDEX "fee_recipients_address_index"
  ON "fee_recipients" ("address");

CREATE UNIQUE INDEX "fee_recipients_address_domain_unique_index"
  ON "fee_recipients" ("address", "domain");

-- Down Migration

DROP TABLE "fee_recipients";
