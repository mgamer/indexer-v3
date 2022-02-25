-- Up Migration
create table daily_volumes
(
    collection_id text    not null,
    timestamp     integer not null,
    volume        numeric(78) not null,
    rank          integer not null,
    constraint daily_volumes_pk
        primary key (collection_id, timestamp)
);

alter table collections
    add daily_volume numeric(78) default 0;

alter table collections
    add daily_rank int default 0;

-- Down Migration
drop table daily_volumes;
