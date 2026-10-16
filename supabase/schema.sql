
-- Watch Party database schema
-- For a prototype. Review security policies before public launch.

create extension if not exists pgcrypto;

create table if not exists public.rooms (
    id uuid primary key default gen_random_uuid(),
    code text unique not null,
    host_id text not null,
    video_title text not null default 'Sample Video',
    video_url text not null default
      'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    is_playing boolean not null default false,
    position_seconds double precision not null default 0,
    playback_updated_at timestamptz not null default now(),
    playlist jsonb not null default '[]'::jsonb,
    polls jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    room_code text not null references public.rooms(code) on delete cascade,
    user_id text not null,
    username text not null,
    content text not null,
    created_at timestamptz not null default now()
);

create index if not exists messages_room_created_idx
    on public.messages(room_code, created_at);

-- Enable row-level security.
alter table public.rooms enable row level security;
alter table public.messages enable row level security;

-- DEMO ONLY: these policies are intentionally permissive so you can
-- test without building authentication first.
-- Do not use them unchanged for a public production application.

drop policy if exists "Prototype read rooms" on public.rooms;
create policy "Prototype read rooms"
on public.rooms for select
to anon, authenticated
using (true);

drop policy if exists "Prototype create rooms" on public.rooms;
create policy "Prototype create rooms"
on public.rooms for insert
to anon, authenticated
with check (true);

drop policy if exists "Prototype update rooms" on public.rooms;
create policy "Prototype update rooms"
on public.rooms for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Prototype read messages" on public.messages;
create policy "Prototype read messages"
on public.messages for select
to anon, authenticated
using (true);

drop policy if exists "Prototype create messages" on public.messages;
create policy "Prototype create messages"
on public.messages for insert
to anon, authenticated
with check (true);

-- Enable Realtime for database changes.
-- If these tables are already in the publication, skip these statements.
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.messages;

