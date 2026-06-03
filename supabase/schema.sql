create table if not exists clinics (
  id text primary key,
  name text not null,
  plan text not null default 'Reviva Pro',
  created_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  clinic_id text not null references clinics(id) on delete cascade,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('owner', 'reception', 'commercial', 'clinical')),
  created_at timestamptz not null default now()
);

create table if not exists patients (
  id bigserial primary key,
  clinic_id text not null references clinics(id) on delete cascade,
  name text not null,
  phone text,
  procedure text,
  status text,
  risk text,
  value_cents integer not null default 0,
  whatsapp_stage text,
  consent_whatsapp boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists packages (
  id bigserial primary key,
  clinic_id text not null references clinics(id) on delete cascade,
  patient_id bigint not null references patients(id) on delete cascade,
  name text not null,
  sessions_used integer not null default 0,
  sessions_total integer not null default 0,
  value_cents integer not null default 0,
  renewal_window text,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists appointments (
  id bigserial primary key,
  clinic_id text not null references clinics(id) on delete cascade,
  patient_id bigint references patients(id) on delete set null,
  starts_at timestamptz,
  procedure text,
  owner text,
  status text not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists message_templates (
  id bigserial primary key,
  clinic_id text references clinics(id) on delete cascade,
  name text not null,
  category text not null,
  objective text,
  use_when text,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  clinic_id text not null references clinics(id) on delete cascade,
  user_id text references users(id) on delete set null,
  event text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
