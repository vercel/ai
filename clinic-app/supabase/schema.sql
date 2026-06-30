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

-- Note: leads is superseded by patient_crm (patient_id nullable, with
-- full_name/phone/email/source for contacts not yet linked to a patient).
-- Kept only for historical data; no longer written to by the app.
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

create type signature_status as enum ('pendente', 'assinado', 'cancelado');

create table document_signatures (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  patient_id uuid references patients (id) on delete set null,
  status signature_status not null default 'pendente',
  document_url text,
  signed_at timestamptz,
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

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create policy "staff read profiles" on profiles for select using (auth.uid() is not null);
create policy "admin manage profiles" on profiles for all using (public.is_admin()) with check (public.is_admin());

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
create policy "staff manage document_signatures" on document_signatures for all using (auth.uid() is not null);

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

-- Migration: expand_clinical_data_model
-- Adds richer patient/prontuário/agenda/CRM/financeiro fields and tables,
-- ported from a more complete reference data model.

alter table patients
  add column if not exists rg text,
  add column if not exists gender text check (gender in ('Masculino','Feminino','Outro','Prefiro não informar')),
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists address_neighborhood text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists address_zip_code text,
  add column if not exists marital_status text,
  add column if not exists occupation text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists insurance_provider text,
  add column if not exists insurance_id_number text,
  add column if not exists insurance_authorization_number text,
  add column if not exists insurance_sessions_authorized integer,
  add column if not exists insurance_sessions_used integer not null default 0,
  add column if not exists responsavel_nome text,
  add column if not exists responsavel_cpf text,
  add column if not exists responsavel_parentesco text,
  add column if not exists responsavel_telefone text,
  add column if not exists responsavel_email text,
  add column if not exists diagnosis_summary text,
  add column if not exists diagnosis_date date,
  add column if not exists allergies text,
  add column if not exists chronic_conditions text,
  add column if not exists is_active boolean not null default true;

create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  capacity integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table rooms enable row level security;
create policy "staff manage rooms" on rooms for all using (auth.uid() is not null);

alter table appointments
  add column if not exists room_id uuid references rooms (id) on delete set null,
  add column if not exists appointment_type text,
  add column if not exists recurrence_series_id uuid,
  add column if not exists recurrence_index integer;

create table therapy_plans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  professional_id uuid references profiles (id),
  area text,
  objetivos text,
  start_date date,
  review_date date,
  status text not null default 'Ativo',
  created_at timestamptz not null default now()
);
alter table therapy_plans enable row level security;
create policy "staff manage therapy_plans" on therapy_plans for all using (auth.uid() is not null);

create table prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  author_id uuid references profiles (id),
  title text not null,
  description text,
  status text not null default 'Rascunho',
  created_at timestamptz not null default now()
);
alter table prescriptions enable row level security;
create policy "staff manage prescriptions" on prescriptions for all using (auth.uid() is not null);

create table patient_documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  title text not null,
  description text,
  file_url text,
  file_type text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
alter table patient_documents enable row level security;
create policy "staff manage patient_documents" on patient_documents for all using (auth.uid() is not null);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit_price integer not null default 0,
  total_price integer not null default 0,
  created_at timestamptz not null default now()
);
alter table invoice_items enable row level security;
create policy "staff manage invoice_items" on invoice_items for all using (auth.uid() is not null);

create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payment_type text,
  is_default boolean not null default false,
  card_brand text,
  card_last_digits text,
  pix_key_type text,
  pix_key text,
  created_at timestamptz not null default now()
);
alter table payment_methods enable row level security;
create policy "staff manage payment_methods" on payment_methods for all using (auth.uid() is not null);

alter table invoices
  add column if not exists payment_method_id uuid references payment_methods (id) on delete set null,
  add column if not exists tax_amount_cents integer not null default 0,
  add column if not exists discount_amount_cents integer not null default 0;

-- patient_crm is the unified funnel: patient_id is null for contacts that
-- aren't patients yet (former "leads"), and set once converted. full_name/
-- phone/email/source apply only while patient_id is null.
create table patient_crm (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients (id) on delete cascade,
  full_name text,
  phone text,
  email text,
  source text,
  current_stage text not null default 'Contato Inicial',
  last_interaction_date timestamptz,
  next_action text,
  next_action_date timestamptz,
  tags text[] default '{}',
  responsible_id uuid references profiles (id),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table patient_crm enable row level security;
create policy "staff manage patient_crm" on patient_crm for all using (auth.uid() is not null);

create table crm_interactions (
  id uuid primary key default gen_random_uuid(),
  patient_crm_id uuid not null references patient_crm (id) on delete cascade,
  interaction_type text,
  date timestamptz not null default now(),
  description text,
  author_id uuid references profiles (id),
  stage_before text,
  stage_after text,
  created_at timestamptz not null default now()
);
alter table crm_interactions enable row level security;
create policy "staff manage crm_interactions" on crm_interactions for all using (auth.uid() is not null);

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text,
  content text not null,
  message_type text not null default 'WhatsApp',
  purpose text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table message_templates enable row level security;
create policy "staff manage message_templates" on message_templates for all using (auth.uid() is not null);

create table scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  template_id uuid references message_templates (id) on delete set null,
  custom_content text,
  scheduled_date timestamptz not null,
  message_type text not null default 'WhatsApp',
  status text not null default 'Pendente',
  created_at timestamptz not null default now()
);
alter table scheduled_messages enable row level security;
create policy "staff manage scheduled_messages" on scheduled_messages for all using (auth.uid() is not null);

create table clinic_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_name text not null default '',
  cnpj text,
  address text,
  phone text,
  email text,
  logo_url text,
  primary_color text,
  updated_at timestamptz not null default now()
);
alter table clinic_settings enable row level security;
create policy "staff manage clinic_settings" on clinic_settings for all using (auth.uid() is not null);

-- Phase 1: multi-tenant plans/clinics (migration: add_plans_and_clinics)
create table plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  max_users int,
  modules text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table plans enable row level security;
create policy "staff read plans" on plans for select using (auth.uid() is not null);

create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan_id uuid not null references plans (id),
  owner_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table clinics enable row level security;
create policy "staff read own clinic" on clinics for select using (auth.uid() is not null);

alter table profiles add column clinic_id uuid references clinics (id);
alter table patients add column clinic_id uuid references clinics (id);

create function current_clinic_id()
returns uuid
language sql
security definer
stable
as $$
  select clinic_id from profiles where id = auth.uid();
$$;

drop policy "staff manage patients" on patients;
create policy "staff manage patients" on patients for all
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

-- handle_new_user() updated to read clinic_id/role from raw_user_meta_data

-- Phase 1: clinic self-registration policies (migration: clinics_signup_policies)
create policy "anyone can create a clinic" on clinics for insert with check (true);
create policy "staff update own clinic" on clinics for update using (clinic_id = public.current_clinic_id());

-- handle_new_user() updated again to claim clinics.owner_id for the first admin signup

-- Phase 1: public plan catalog read (migration: plans_public_read)
create policy "anyone can read plans" on plans for select using (true);

-- ============================================================
-- Phase 2: Full multi-tenant architecture
-- ============================================================

-- Migration: add_trial_and_price_to_plans
alter table plans add column if not exists price_cents int not null default 0;
alter table plans add column if not exists trial_days int not null default 0;
alter table clinics add column if not exists trial_ends_at timestamptz;

-- Migration: add_subscriptions
create type subscription_status as enum ('trialing','active','past_due','suspended','canceled');
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null unique references clinics(id) on delete cascade,
  plan_id uuid not null references plans(id),
  status subscription_status not null default 'trialing',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default now() + interval '30 days',
  past_due_since timestamptz,
  grace_period_days int not null default 5,
  pending_plan_id uuid references plans(id),
  gateway_subscription_id text,
  updated_at timestamptz not null default now()
);
alter table subscriptions enable row level security;
create policy "staff read own subscription" on subscriptions for select using (clinic_id = public.current_clinic_id());
create policy "staff update own subscription" on subscriptions for update using (clinic_id = public.current_clinic_id());

-- Migration: add_is_locked_and_audit_logs
alter table profiles add column if not exists is_locked boolean not null default false;
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id),
  actor_id uuid,
  actor_role text,
  action text not null,
  table_name text,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);
create index audit_logs_clinic_idx on audit_logs (clinic_id, created_at desc);
create index audit_logs_record_idx on audit_logs (table_name, record_id);
alter table audit_logs enable row level security;
create policy "admin read own audit logs" on audit_logs for select using (clinic_id = public.current_clinic_id());

-- Migration: add_audit_log_trigger (log_audit_event + audit_sensitive_change trigger)

-- Migration: add_super_admins_and_impersonation
create table super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
create table impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  super_admin_id uuid not null references super_admins(user_id),
  clinic_id uuid not null references clinics(id),
  reason text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

-- Migration: add_clinic_fiscal_settings
create table clinic_fiscal_settings (
  clinic_id uuid primary key references clinics(id) on delete cascade,
  municipal_registration text,
  tax_regime text,
  cnae text,
  ctiss_code text,
  iss_rate numeric(5,2),
  cert_path text,
  cert_password_encrypted text,
  cert_expires_at timestamptz,
  gateway_provider text,
  gateway_company_id text,
  nfse_auto_emit boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table clinic_fiscal_settings enable row level security;
create policy "admin manage fiscal settings" on clinic_fiscal_settings for all
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

-- Migration: extend_fiscal_notes_for_nfse
alter table fiscal_notes add column if not exists clinic_id uuid references clinics(id);
alter table fiscal_notes add column if not exists gateway_invoice_id text;
alter table fiscal_notes add column if not exists pdf_url text;
alter table fiscal_notes add column if not exists xml_url text;
alter table fiscal_notes add column if not exists error_message text;

-- Migration: clinic_id_on_all_tables
-- (clinic_id added to all 24 remaining tenant tables + backfill + RLS clinic isolation policies)
