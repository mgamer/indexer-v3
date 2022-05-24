-- Up Migration

CREATE TABLE activities (
    id bigserial NOT NULL,
	  created_at timestamp with time zone DEFAULT NOW(),
	  transaction_id text,
    type text NOT NULL,
    contract BYTEA,
    collection_id text,
    token_id NUMERIC(78),
    address BYTEA,
    from_address BYTEA,
    to_address BYTEA,
    price NUMERIC(78),
    amount NUMERIC(78),
    metadata JSONB,
    CONSTRAINT activities_pk PRIMARY KEY (id)
);

CREATE INDEX activities_address_created_at_type_index
    ON activities (address, created_at DESC NULLS LAST, type);

CREATE INDEX activities_collection_id_created_at_type_index
    ON activities (collection_id, created_at DESC NULLS LAST, type);

CREATE INDEX activities_contract_token_id_created_at_type_index
    ON activities (contract, token_id, created_at DESC NULLS LAST, type);

CREATE UNIQUE INDEX activities_transaction_id_address_unique_index
    ON activities (transaction_id, address);

-- Down Migration

DROP TABLE activities;