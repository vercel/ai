-- Clinic management system schema
-- Run this in the Supabase SQL editor (or via `apply_migration`).

create type user_role as enum ('admin', 'medico', 'recepcao');
create type appointment_status as enum ('agendado', 'confirmado', 'cancelado', 'concluido');
create type invoice_status as enum ('pendente', 'pago', 'cancelado');
create type campaign_status as enum ('rascunho', 'agendada', 'enviada');
create type lead_stage as enum ('novo', 'contato', 'agendado', 'convertido', 'perdido');
create type lab_order_status as enum ('solicitado', 'coletado', 'em_analise', 'concluido');
create type cash_advance_status as enum ('solicitado', 'aprovado', 'pago', 'rejeitado');
create type fiscal_note_status as enum ('pendente', 'emitida', 'cancelada');
create type conversation_status as enum ('aberta', 'pendente', 'resolvida');
create type message_sender as enum ('contato', 'equipe', 'ia');

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
  signed_at timestamptz,
  signature_data text,
  content_hash text,
  created_at timestamptz not null default now()
);

create table consent_forms (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  title text not null,
  content text not null,
  created_by uuid references profiles (id),
  signed_at timestamptz,
  signer_name text,
  signature_data text,
  content_hash text,
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
  payment_method text,
  created_at timestamptz not null default now()
);

create table availability (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null default 'email',
  message text not null,
  target_filter text,
  status campaign_status not null default 'rascunho',
  scheduled_at timestamptz,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  source text,
  stage lead_stage not null default 'novo',
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table lab_orders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  professional_id uuid not null references profiles (id),
  exam_name text not null,
  status lab_order_status not null default 'solicitado',
  result_text text,
  result_file text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create table cash_advances (
  id uuid primary key default gen_random_uuid(),
  amount_cents integer not null,
  status cash_advance_status not null default 'solicitado',
  requested_by uuid references profiles (id),
  notes text,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_cents integer not null,
  stock integer not null default 0,
  description text,
  created_at timestamptz not null default now()
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  patient_id uuid references patients (id) on delete set null,
  quantity integer not null default 1,
  total_cents integer not null,
  sold_by uuid references profiles (id),
  sold_at timestamptz not null default now()
);

create table fiscal_notes (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  number text,
  series text,
  status fiscal_note_status not null default 'pendente',
  issued_at timestamptz,
  created_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null,
  contact_phone text,
  channel text not null default 'whatsapp',
  status conversation_status not null default 'aberta',
  patient_id uuid references patients (id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender message_sender not null default 'equipe',
  body text not null,
  sent_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table campaign_blocklist (
  id uuid primary key default gen_random_uuid(),
  contact text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table assistant_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Fer',
  enabled boolean not null default false,
  persona text not null default 'Assistente virtual da clínica, responde dúvidas, agenda consultas e confirma horários via WhatsApp.',
  auto_schedule boolean not null default false,
  auto_broadcast boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Row Level Security: any authenticated staff member can read/write clinical
-- data; only admins can manage profiles/roles.
alter table profiles enable row level security;
alter table patients enable row level security;
alter table medical_records enable row level security;
alter table appointments enable row level security;
alter table invoices enable row level security;
alter table availability enable row level security;
alter table consent_forms enable row level security;
alter table campaigns enable row level security;
alter table leads enable row level security;
alter table lab_orders enable row level security;
alter table cash_advances enable row level security;
alter table products enable row level security;
alter table sales enable row level security;
alter table fiscal_notes enable row level security;
alter table conversations enable row level security;
alter table conversation_messages enable row level security;

create policy "staff read profiles" on profiles for select using (auth.uid() is not null);
create policy "admin manage profiles" on profiles for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "staff manage patients" on patients for all using (auth.uid() is not null);
create policy "staff manage medical_records" on medical_records for all using (auth.uid() is not null);
create policy "staff manage appointments" on appointments for all using (auth.uid() is not null);
create policy "staff manage invoices" on invoices for all using (auth.uid() is not null);
create policy "staff manage availability" on availability for all using (auth.uid() is not null);
create policy "staff manage consent_forms" on consent_forms for all using (auth.uid() is not null);
create policy "staff manage campaigns" on campaigns for all using (auth.uid() is not null);
create policy "staff manage leads" on leads for all using (auth.uid() is not null);
create policy "staff manage lab_orders" on lab_orders for all using (auth.uid() is not null);
create policy "staff manage cash_advances" on cash_advances for all using (auth.uid() is not null);
create policy "staff manage products" on products for all using (auth.uid() is not null);
create policy "staff manage sales" on sales for all using (auth.uid() is not null);
create policy "staff manage fiscal_notes" on fiscal_notes for all using (auth.uid() is not null);
create policy "staff manage conversations" on conversations for all using (auth.uid() is not null);
create policy "staff manage conversation_messages" on conversation_messages for all using (auth.uid() is not null);
create policy "staff manage assistant_settings" on assistant_settings for all using (auth.uid() is not null);
create policy "staff manage campaign_blocklist" on campaign_blocklist for all using (auth.uid() is not null);

-- Storage bucket for medical record attachments (created via Supabase dashboard/MCP):
-- insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false);
-- create policy "staff read attachments" on storage.objects for select using (bucket_id = 'attachments' and auth.uid() is not null);
-- create policy "staff upload attachments" on storage.objects for insert with check (bucket_id = 'attachments' and auth.uid() is not null);

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
