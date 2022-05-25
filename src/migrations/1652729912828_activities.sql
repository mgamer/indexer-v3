-- Up Migration

CREATE TABLE activities (
    id bigserial NOT NULL,
	  created_at timestamp with time zone DEFAULT NOW(),
	  subject text,
	  activity_hash text,
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

CREATE INDEX activities_subject_address_created_at_type_index
    ON activities (subject, address, created_at DESC NULLS LAST, type);

CREATE INDEX activities_subject_collection_id_created_at_type_index
    ON activities (subject, collection_id, created_at DESC NULLS LAST, type);

CREATE INDEX activities_subject_contract_token_id_created_at_type_index
    ON activities (subject, contract, token_id, created_at DESC NULLS LAST, type);

CREATE UNIQUE INDEX activities_subject_activity_hash_address_unique_index
    ON activities (subject, activity_hash, address);

-- Down Migration

DROP TABLE activities;