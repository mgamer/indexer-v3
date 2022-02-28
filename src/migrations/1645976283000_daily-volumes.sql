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
    add day1_volume numeric(78) default null;

alter table collections
    add day1_rank int default null;

alter table collections
    add day7_volume numeric(78) default null;

alter table collections
    add day7_rank int default null;

alter table collections
    add day30_volume numeric(78) default null;

alter table collections
    add day30_rank int default null;

alter table collections
    add all_time_volume numeric(78) default null;

alter table collections
    add all_time_rank int default null;

create index fill_events_2_timestamp_index
    on fill_events_2 (timestamp);

drop index collections_name_index;

create index collections_name_all_time_volume_index
    on collections (name, all_time_volume);

create index collections_name_day1_volume_index
    on collections (name, day1_volume);

create index collections_day1_volume_index
    on collections (day1_volume);

create index collections_all_time_volume_index
    on collections (all_time_volume);

-- Down Migration
drop table daily_volumes;

alter table collections
drop column day1_volume;

alter table collections
drop column day1_rank;

alter table collections
drop column day7_volume;

alter table collections
drop column day7_rank;

alter table collections
drop column day30_volume;

alter table collections
drop column day30_rank;

alter table collections
drop column all_time_volume;

alter table collections
drop column all_time_rank;

drop index fill_events_2_timestamp_index;

create index collections_name_index
    on collections (name);

