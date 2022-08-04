-- Up Migration

CREATE TABLE user_received_bids (
    id bigserial NOT NULL,
    address BYTEA,
    contract BYTEA,
    token_id NUMERIC(78),
	order_id TEXT,
    maker BYTEA,
    price NUMERIC(78),
    value NUMERIC(78),
    quantity NUMERIC(78, 0) DEFAULT 1,
    valid_between TSTZRANGE,
    created_at timestamp with time zone DEFAULT NOW(),
    CONSTRAINT user_received_bids_pk PRIMARY KEY (id)
);

CREATE UNIQUE INDEX user_received_bids_contract_token_id_address_order_id_index
    ON user_received_bids (contract, token_id, address, order_id);

CREATE INDEX user_received_bids_address_index
    ON user_received_bids (address);

-- Down Migration

DROP TABLE user_received_bids;
