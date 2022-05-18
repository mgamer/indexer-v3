-- Up Migration

CREATE TABLE activities (
    id bigserial NOT NULL,
	  created_at timestamp with time zone DEFAULT NOW(),
    type text NOT NULL,
    contract bytea,
    collection_id text,
    token_id numeric(78),
    address bytea,
    from_address bytea,
    to_address bytea,
    price numeric(78),
    amount numeric(78),
    CONSTRAINT activities_pk PRIMARY KEY (id)
);

CREATE INDEX activities_address_created_at_type_index
    ON activities (address, created_at DESC NULLS LAST, type);

CREATE INDEX activities_collection_id_created_at_type_index
    ON activities (collection_id, created_at DESC NULLS LAST, type);

CREATE INDEX activities_collection_id_created_at_type_index
    ON activities (collection_id, token_id, created_at DESC NULLS LAST, type);

-- Down Migration

DROP TABLE activities;