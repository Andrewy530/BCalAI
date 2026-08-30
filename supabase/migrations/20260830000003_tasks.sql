-- ============================================================================
-- 0003 — Task lists, tasks, and tags.
-- ============================================================================

create type public.task_status as enum ('open', 'scheduled', 'completed', 'archived');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');

-- ---------------------------------------------------------------------------
-- task_lists
-- ---------------------------------------------------------------------------
create table public.task_lists (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  color text not null default '#6E8BFF' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index task_lists_user_position_idx on public.task_lists (user_id, position);

create trigger task_lists_set_updated_at
  before update on public.task_lists
  for each row execute function public.set_updated_at();

alter table public.task_lists enable row level security;

create policy "Users read their own lists"
  on public.task_lists for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert their own lists"
  on public.task_lists for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own lists"
  on public.task_lists for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their own lists"
  on public.task_lists for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
create table public.tags (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null default '#8C93A8' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create unique index tags_user_name_idx on public.tags (user_id, lower(name));

alter table public.tags enable row level security;

create policy "Users read their own tags"
  on public.tags for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert their own tags"
  on public.tags for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own tags"
  on public.tags for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their own tags"
  on public.tags for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  list_id uuid references public.task_lists (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  description text check (char_length(description) <= 10000),
  status public.task_status not null default 'open',
  priority public.task_priority not null default 'normal',
  due_at timestamptz,
  -- false when the user picked a date but no specific time.
  has_due_time boolean not null default false,
  estimated_minutes integer check (estimated_minutes between 5 and 1440),
  -- The time block this task was scheduled into, if any.
  scheduled_event_id uuid references public.events (id) on delete set null,
  -- Only flexible tasks may be moved by the scheduling engine.
  is_flexible boolean not null default true,
  recurrence_rule text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tasks_due_time_requires_due_at check (not has_due_time or due_at is not null),
  constraint tasks_completed_at_matches_status check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create index tasks_user_status_idx on public.tasks (user_id, status);
create index tasks_user_due_idx on public.tasks (user_id, due_at) where due_at is not null;
create index tasks_list_idx on public.tasks (list_id) where list_id is not null;
-- Feeds the "Find Time" queue.
create index tasks_schedulable_idx on public.tasks (user_id)
  where status = 'open' and is_flexible and scheduled_event_id is null;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

create policy "Users read their own tasks"
  on public.tasks for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users insert their own tasks"
  on public.tasks for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own tasks"
  on public.tasks for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their own tasks"
  on public.tasks for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- task_tags — join table. Ownership is inherited from the task.
-- ---------------------------------------------------------------------------
create table public.task_tags (
  task_id uuid not null references public.tasks (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (task_id, tag_id)
);

create index task_tags_tag_idx on public.task_tags (tag_id);

alter table public.task_tags enable row level security;

create policy "Users read tags on their own tasks"
  on public.task_tags for select to authenticated
  using (exists (
    select 1 from public.tasks t
    where t.id = task_tags.task_id and t.user_id = (select auth.uid())
  ));

create policy "Users tag their own tasks with their own tags"
  on public.task_tags for insert to authenticated
  with check (
    exists (select 1 from public.tasks t
            where t.id = task_tags.task_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.tags g
                where g.id = task_tags.tag_id and g.user_id = (select auth.uid()))
  );

create policy "Users remove tags from their own tasks"
  on public.task_tags for delete to authenticated
  using (exists (
    select 1 from public.tasks t
    where t.id = task_tags.task_id and t.user_id = (select auth.uid())
  ));
