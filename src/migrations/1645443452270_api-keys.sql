-- Up Migration
create table api_keys
(
    key        text                                                                                       not null
        primary key,
    app_name   text                                                                                       not null,
    website    text                                                                                       not null,
    email      text                                                                                       not null,
    created_at timestamp with time zone default now(),
    active     boolean                  default true                                                      not null
);

-- Down Migration
drop table api_keys
