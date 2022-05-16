-- Up Migration

CREATE TABLE events (
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
    CONSTRAINT events_pk PRIMARY KEY (id)
);

CREATE INDEX events_address_created_at_index
    ON events (address ASC NULLS LAST, created_at DESC NULLS LAST, type);

CREATE INDEX events_collection_id_created_at_index
    ON events (collection_id, created_at DESC NULLS LAST, type);

CREATE INDEX events_collection_id_created_at_index
    ON events (collection_id, token_id, created_at DESC NULLS LAST, type);

-- Down Migration

DROP TABLE events;