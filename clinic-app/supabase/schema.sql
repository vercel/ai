-- Clinic management system schema
-- Run this in the Supabase SQL editor (or via `apply_migration`).

create type user_role as enum ('admin', 'medico', 'recepcao');
create type appointment_status as enum ('agendado', 'confirmado', 'cancelado', 'concluido');
create type invoice_status as enum ('pendente', 'pago', 'cancelado');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role user_role not null default 'recepcao',
  created_at timestamptz not null default now()
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  cpf text,
  birth_date date,
  phone text,
  email text,
  address text,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table medical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  professional_id uuid not null references profiles (id),
  entry text not null,
  attachments text[] default '{}',
  created_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  professional_id uuid not null references profiles (id),
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 30,
  status appointment_status not null default 'agendado',
  notes text,
  created_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  appointment_id uuid references appointments (id) on delete set null,
  amount_cents integer not null,
  status invoice_status not null default 'pendente',
  due_date date,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- Row Level Security: any authenticated staff member can read/write clinical
-- data; only admins can manage profiles/roles.
alter table profiles enable row level security;
alter table patients enable row level security;
alter table medical_records enable row level security;
alter table appointments enable row level security;
alter table invoices enable row level security;

create policy "staff read profiles" on profiles for select using (auth.uid() is not null);
create policy "admin manage profiles" on profiles for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "staff manage patients" on patients for all using (auth.uid() is not null);
create policy "staff manage medical_records" on medical_records for all using (auth.uid() is not null);
create policy "staff manage appointments" on appointments for all using (auth.uid() is not null);
create policy "staff manage invoices" on invoices for all using (auth.uid() is not null);

-- Auto-create a profile row when a new auth user signs up.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'recepcao');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
