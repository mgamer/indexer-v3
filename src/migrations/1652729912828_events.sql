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

-- Down Migration

DROP TABLE events;