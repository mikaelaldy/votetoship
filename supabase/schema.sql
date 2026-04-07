create table if not exists app_state (
  id int primary key,
  active_battle_id text not null,
  updated_at timestamptz not null default now()
);

create table if not exists idea_battles (
  id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists ideas (
  id text primary key,
  battle_id text not null references idea_battles(id) on delete cascade,
  title text not null,
  description text not null,
  source text not null default 'glm',
  created_at timestamptz not null default now()
);

create table if not exists votes (
  id text primary key,
  idea_id text not null references ideas(id) on delete cascade,
  voter_key text not null,
  direction text not null check (direction in ('up','down')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idea_id, voter_key)
);

create table if not exists builds (
  id text primary key,
  idea_id text not null unique references ideas(id) on delete cascade,
  slug text not null unique,
  title text not null,
  reasoning text not null default '',
  stream_text text not null default '',
  landing_html text not null default '',
  app_html text not null default '',
  status text not null check (status in ('building','completed','failed')),
  error_message text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_ideas_battle_id on ideas(battle_id);
create index if not exists idx_votes_idea_id on votes(idea_id);
create index if not exists idx_builds_status on builds(status);
create index if not exists idx_builds_completed_at on builds(completed_at desc);

create or replace function append_build_stream(p_build_id text, p_delta text)
returns void as $$
begin
  update builds
  set stream_text = stream_text || p_delta,
      updated_at = now()
  where id = p_build_id;
end;
$$ language plpgsql;
