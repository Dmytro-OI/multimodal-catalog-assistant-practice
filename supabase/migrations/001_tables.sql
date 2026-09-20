create extension if not exists vector with schema extensions;

create table if not exists public.product_ai_metadata (
  product_id bigint primary key references public.products(id) on delete cascade,
  ai_description text,
  search_text text,
  attributes jsonb not null default '{}'::jsonb,
  embedding extensions.vector(768),
  embedding_model text,
  embedding_dimensions integer,
  vision_model text,
  confidence real,
  source_image_path text,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'ready', 'failed')),
  processing_error text,
  reviewed boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_ai_metadata_embedding_hnsw_idx
  on public.product_ai_metadata
  using hnsw (embedding extensions.vector_cosine_ops);

create table if not exists public.assistant_users (
  id bigint generated always as identity primary key,
  telegram_user_id text not null unique,
  telegram_username text,
  display_name text,
  language text not null default 'uk',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_messages (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.assistant_users(id) on delete cascade,
  telegram_chat_id text not null,
  direction text not null check (direction in ('inbound', 'outbound', 'system')),
  sender_type text not null check (sender_type in ('customer', 'assistant', 'manager', 'system')),
  text text not null,
  language text,
  telegram_message_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists assistant_messages_user_created_idx
  on public.assistant_messages (user_id, created_at desc);

create table if not exists public.assistant_support_requests (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.assistant_users(id) on delete cascade,
  telegram_chat_id text not null,
  initial_message text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.assistant_support_notifications (
  id bigint generated always as identity primary key,
  support_request_id bigint not null references public.assistant_support_requests(id) on delete cascade,
  admin_telegram_id text not null,
  telegram_message_id bigint not null,
  created_at timestamptz not null default now(),
  unique (admin_telegram_id, telegram_message_id)
);

create or replace function public.match_catalog_products(
  query_embedding extensions.vector(768),
  match_threshold float,
  match_count integer
)
returns table (
  product_id bigint,
  name text,
  slug text,
  image_path text,
  ai_description text,
  attributes jsonb,
  similarity float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    p.id,
    p.name,
    p.slug,
    p.image_path,
    m.ai_description,
    m.attributes,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.product_ai_metadata m
  join public.products p on p.id = m.product_id
  where m.processing_status = 'ready'
    and m.embedding is not null
    and 1 - (m.embedding <=> query_embedding) >= match_threshold
  order by m.embedding <=> query_embedding
  limit least(match_count, 20);
$$;

revoke all on function public.match_catalog_products(extensions.vector, float, integer) from public;
grant execute on function public.match_catalog_products(extensions.vector, float, integer) to service_role;

alter table public.product_ai_metadata enable row level security;
alter table public.assistant_users enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_support_requests enable row level security;
alter table public.assistant_support_notifications enable row level security;

revoke all on public.product_ai_metadata from anon, authenticated;
revoke all on public.assistant_users from anon, authenticated;
revoke all on public.assistant_messages from anon, authenticated;
revoke all on public.assistant_support_requests from anon, authenticated;
revoke all on public.assistant_support_notifications from anon, authenticated;
