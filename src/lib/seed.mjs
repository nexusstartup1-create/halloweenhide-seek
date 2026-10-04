// Database schema. Used by scripts/setup.mjs. Plain JS so Node runs it without a build step.

export const DROP = `
drop sequence if exists game_id_seq;
drop table if exists push_subs, flash_slots, sessions, ledger, proofs, cards, capture_attempts, messages, alerts, pings,
  quest_completions, quests, players, pairs, game cascade;
`;

export const SCHEMA = `
create table if not exists game (
  id int primary key default 1,
  round int not null default 1,
  drawn_at timestamptz,
  started_at timestamptz,
  live_at timestamptz,
  ends_at timestamptz,
  ended_at timestamptz,
  winner_kind text,
  winner_id text
);

create table if not exists pairs (
  id text primary key,
  name text not null,
  pool int not null default 0,
  last_gain_at timestamptz
);
create table if not exists players (
  id text primary key,
  name text not null,
  name_key text not null unique,
  role text check (role in ('HUNTER','FUGITIVE')),
  pair_id text references pairs(id) on delete set null,
  rejoin_code text not null unique,
  password text unique,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','CAPTURED')),
  captured_by text,
  captured_at timestamptz,
  lat double precision,
  lng double precision,
  acc_m real,
  fix_at timestamptz,
  out_since timestamptz,
  out_reported boolean not null default false,
  joined_at timestamptz not null default now()
);
create table if not exists sessions (
  token text primary key,
  player_id text not null references players(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists ledger (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null,
  pair_id text,
  pair_delta int not null default 0,
  hunter_id text,
  hunter_delta int not null default 0,
  ref_id text,
  actor_id text
);
create table if not exists proofs (
  id bigserial primary key,
  mission_id text not null,
  pair_id text not null,
  player_id text not null,
  pathname text not null,
  kind text not null,
  content_type text not null,
  points int not null,
  at timestamptz not null default now(),
  unique (mission_id, pair_id)
);
create table if not exists cards (
  id serial primary key,
  code text not null,
  owner_id text not null references players(id) on delete cascade,
  uses_left int,
  activated_at timestamptz,
  active_until timestamptz,
  cooldown_until timestamptz,
  target text,
  voided boolean not null default false
);
create table if not exists capture_attempts (
  id bigserial primary key,
  hunter_id text not null,
  input text not null,
  result text not null,
  target_id text,
  at timestamptz not null default now()
);
create table if not exists messages (
  id bigserial primary key,
  channel text not null,
  sender_id text,
  kind text not null default 'USER',
  body text not null,
  proof_id bigint,
  at timestamptz not null default now()
);
create table if not exists alerts (
  id bigserial primary key,
  player_id text not null,
  kind text not null,
  body text not null,
  at timestamptz not null default now()
);
create table if not exists pings (
  id bigserial primary key,
  hunter_id text not null,
  origin text not null,
  sectors jsonb not null,
  at timestamptz not null default now(),
  expires_at timestamptz not null
);
create table if not exists push_subs (
  endpoint text primary key,
  player_id text not null references players(id) on delete cascade,
  sub jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists flash_slots (
  round int not null,
  slot int not null,
  mission_id text not null,
  primary key (round, slot)
);
alter table game add column if not exists host_id text;
alter table players add column if not exists last_seen timestamptz;
alter table players add column if not exists blur_lat double precision;
alter table players add column if not exists blur_lng double precision;
alter table players add column if not exists blur_at timestamptz;
alter table players add column if not exists avatar bytea;
alter table players add column if not exists avatar_at timestamptz;
alter table players add column if not exists typing_channel text;
alter table players add column if not exists typing_at timestamptz;
alter table messages add column if not exists deleted_at timestamptz;
alter table messages add column if not exists audio_path text;
alter table messages add column if not exists audio_ms int;
alter table messages add column if not exists audio_type text;
alter table players add column if not exists typing_kind text;
alter table proofs add column if not exists flash boolean not null default false;
create index if not exists messages_channel_id on messages(channel, id);

-- ---------- many games at once: every row belongs to a game (existing data becomes game 1) ----------
alter table game add column if not exists code text;
alter table game add column if not exists zone text not null default 'cirenaica';
alter table game add column if not exists created_at timestamptz not null default now();
create sequence if not exists game_id_seq;
select setval('game_id_seq', greatest(coalesce((select max(id) from game), 0), 1));
alter table game alter column id set default nextval('game_id_seq');
update game set code = upper(substr(translate(md5(random()::text || id::text), '01', 'xy'), 1, 5)) where code is null;
create unique index if not exists game_code_key on game(code);

alter table players add column if not exists game_id int references game(id) on delete cascade;
update players set game_id = (select min(id) from game) where game_id is null;
alter table players drop constraint if exists players_name_key_key;
create unique index if not exists players_game_name on players(game_id, name_key);
alter table players drop constraint if exists players_password_key;
create unique index if not exists players_game_password on players(game_id, password);
create index if not exists players_game on players(game_id);

alter table pairs add column if not exists game_id int references game(id) on delete cascade;
update pairs set game_id = (select min(id) from game) where game_id is null;
alter table ledger add column if not exists game_id int;
update ledger set game_id = (select min(id) from game) where game_id is null;
alter table proofs add column if not exists game_id int;
update proofs set game_id = (select min(id) from game) where game_id is null;
alter table messages add column if not exists game_id int;
update messages set game_id = (select min(id) from game) where game_id is null;
create index if not exists messages_game_channel_id on messages(game_id, channel, id);
alter table pings add column if not exists game_id int;
update pings set game_id = (select min(id) from game) where game_id is null;
alter table flash_slots add column if not exists game_id int not null default 1;
-- per-game settings chosen by the host, pause, spectators
alter table game add column if not exists live_min int not null default 70;
alter table game add column if not exists head_start_min int not null default 10;
alter table game add column if not exists zone_radius_m int not null default 80;
alter table game add column if not exists missions_mode text not null default 'chill';
alter table game add column if not exists paused_at timestamptz;
alter table players add column if not exists spectator boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'flash_slots_game_pk') then
    alter table flash_slots drop constraint if exists flash_slots_pkey;
    alter table flash_slots add constraint flash_slots_game_pk primary key (game_id, round, slot);
  end if;
end $$;
create index if not exists alerts_player_at on alerts(player_id, at);
create index if not exists attempts_hunter_at on capture_attempts(hunter_id, at);
`;
