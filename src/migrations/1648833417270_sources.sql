-- Up Migration

CREATE TABLE "sources_v2" (
  "id" SERIAL PRIMARY KEY,
  "domain" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "metadata" JSONB NOT NULL
);

CREATE UNIQUE INDEX "sources_domain_unique_index"
  ON "sources_v2" ("domain");

CREATE UNIQUE INDEX "sources_name_unique_index"
  ON "sources_v2" ("name");

CREATE UNIQUE INDEX "sources_address_unique_index"
  ON "sources_v2" ("address");

INSERT INTO "sources_v2" (name, domain, address, metadata)
VALUES('OpenSea', 'opensea.io', '0x5b3256965e7c3cf26e11fcaf296dfc8807c01073', '{"icon":"https://opensea.io/static/images/logos/opensea.svg","tokenUrlMainnet":"https://opensea.io/assets/${contract}/${tokenId}","tokenUrlRinkeby":"https://testnets.opensea.io/assets/${contract}/${tokenId}"}');

INSERT INTO "sources_v2" (name, domain, address, metadata)
VALUES('Forgotten Market', 'forgotten.market', '0xfdfda3d504b1431ea0fd70084b1bfa39fa99dcc4', '{"icon":"https://forgotten.market/static/img/favicon.ico","tokenUrlMainnet":"https://forgotten.market/${contract}/${tokenId}","tokenUrlRinkeby":"https://forgotten.market/${contract}/${tokenId}"}');

INSERT INTO "sources_v2" (name, domain, address, metadata)
VALUES('LooksRare', 'looksrare.org', '0x5924a28caaf1cc016617874a2f0c3710d881f3c1', '{"icon":"https://docs.looksrare.org/img/favicon.ico","tokenUrlMainnet":"https://looksrare.org/collections/${contract}/${tokenId}","tokenUrlRinkeby":"https://rinkeby.looksrare.org/collections/${contract}/${tokenId}"}');

-- Down Migration

DROP TABLE "sources_v2";
