export type UserRole = 'admin' | 'medico' | 'recepcao';
export type AppointmentStatus = 'agendado' | 'confirmado' | 'cancelado' | 'concluido';
export type InvoiceStatus = 'pendente' | 'pago' | 'cancelado';
export type CampaignStatus = 'rascunho' | 'agendada' | 'enviada';
export type LeadStage = 'novo' | 'contato' | 'agendado' | 'convertido' | 'perdido';
export type LabOrderStatus = 'solicitado' | 'coletado' | 'em_analise' | 'concluido';
export type CashAdvanceStatus = 'solicitado' | 'aprovado' | 'pago' | 'rejeitado';
export type FiscalNoteStatus = 'pendente' | 'emitida' | 'cancelada';
export type ConversationStatus = 'aberta' | 'pendente' | 'resolvida';
export type MessageSender = 'contato' | 'equipe' | 'ia';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  clinic_id: string | null;
  created_at: string;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled';

export interface Plan {
  id: string;
  slug: string;
  name: string;
  max_users: number | null;
  modules: string[];
  price_cents: number;
  trial_days: number;
  created_at: string;
}

export interface Clinic {
  id: string;
  name: string;
  legal_name: string | null;
  document_number: string | null;
  plan_id: string;
  owner_id: string | null;
  is_active: boolean;
  trial_ends_at: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  clinic_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  past_due_since: string | null;
  grace_period_days: number;
  pending_plan_id: string | null;
  gateway_subscription_id: string | null;
  updated_at: string;
}

export interface DataExport {
  id: string;
  clinic_id: string;
  requested_by: string | null;
  reason: string;
  status: 'processing' | 'ready' | 'failed';
  file_path: string | null;
  signed_url: string | null;
  expires_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface Patient {
  id: string;
  full_name: string;
  cpf: string | null;
  rg: string | null;
  gender: string | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip_code: string | null;
  marital_status: string | null;
  occupation: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  insurance_provider: string | null;
  insurance_id_number: string | null;
  insurance_authorization_number: string | null;
  insurance_sessions_authorized: number | null;
  insurance_sessions_used: number;
  responsavel_nome: string | null;
  responsavel_cpf: string | null;
  responsavel_parentesco: string | null;
  responsavel_telefone: string | null;
  responsavel_email: string | null;
  diagnosis_summary: string | null;
  diagnosis_date: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  is_active: boolean;
  created_at: string;
}

export interface TherapyPlan {
  id: string;
  patient_id: string;
  professional_id: string | null;
  area: string | null;
  objetivos: string | null;
  start_date: string | null;
  review_date: string | null;
  status: string;
  created_at: string;
}

export interface Prescription {
  id: string;
  patient_id: string;
  author_id: string | null;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
}

export interface PatientDocument {
  id: string;
  patient_id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  file_type: string | null;
  is_archived: boolean;
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  payment_type: string | null;
  is_default: boolean;
  card_brand: string | null;
  card_last_digits: string | null;
  pix_key_type: string | null;
  pix_key: string | null;
  created_at: string;
}

export interface PatientCRM {
  id: string;
  patient_id: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  current_stage: string;
  last_interaction_date: string | null;
  next_action: string | null;
  next_action_date: string | null;
  tags: string[];
  responsible_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CRMInteraction {
  id: string;
  patient_crm_id: string;
  interaction_type: string | null;
  date: string;
  description: string | null;
  author_id: string | null;
  stage_before: string | null;
  stage_after: string | null;
  created_at: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  subject: string | null;
  content: string;
  message_type: string;
  purpose: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ScheduledMessage {
  id: string;
  patient_id: string;
  template_id: string | null;
  custom_content: string | null;
  scheduled_date: string;
  message_type: string;
  status: string;
  created_at: string;
}

export interface MedicalRecord {
  id: string;
  patient_id: string;
  professional_id: string;
  entry: string;
  attachments: string[];
  signed_at: string | null;
  signature_data: string | null;
  content_hash: string | null;
  signer_ip: string | null;
  created_at: string;
}

export interface ConsentForm {
  id: string;
  patient_id: string;
  title: string;
  content: string;
  created_by: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signature_data: string | null;
  content_hash: string | null;
  signer_ip: string | null;
  created_at: string;
}

export interface Appointment {
  id: string;
  patient_id: string;
  professional_id: string;
  room_id: string | null;
  appointment_type: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: AppointmentStatus;
  notes: string | null;
  recurrence_series_id: string | null;
  recurrence_index: number | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  amount_cents: number;
  tax_amount_cents: number;
  discount_amount_cents: number;
  status: InvoiceStatus;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  payment_method_id: string | null;
  created_at: string;
}

export interface Availability {
  id: string;
  professional_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

export interface Campaign {
  id: string;
  name: string;
  channel: string;
  message: string;
  target_filter: string | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  stage: LeadStage;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LabOrder {
  id: string;
  patient_id: string;
  professional_id: string;
  exam_name: string;
  status: LabOrderStatus;
  result_text: string | null;
  result_file: string | null;
  requested_at: string;
  completed_at: string | null;
}

export interface CashAdvance {
  id: string;
  amount_cents: number;
  status: CashAdvanceStatus;
  requested_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  price_cents: number;
  stock: number;
  description: string | null;
  created_at: string;
}

export interface Sale {
  id: string;
  product_id: string;
  patient_id: string | null;
  quantity: number;
  total_cents: number;
  sold_by: string | null;
  sold_at: string;
}

export interface FiscalNote {
  id: string;
  invoice_id: string;
  number: string | null;
  series: string | null;
  status: FiscalNoteStatus;
  issued_at: string | null;
  created_at: string;
  clinic_id: string | null;
  gateway_invoice_id: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  error_message: string | null;
}

export interface Conversation {
  id: string;
  contact_name: string;
  contact_phone: string | null;
  channel: string;
  status: ConversationStatus;
  patient_id: string | null;
  last_message_at: string;
  created_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  sender: MessageSender;
  body: string;
  sent_by: string | null;
  created_at: string;
}

export interface AssistantSettings {
  id: string;
  name: string;
  enabled: boolean;
  persona: string;
  auto_schedule: boolean;
  auto_broadcast: boolean;
  updated_at: string;
}

export interface CampaignBlocklistEntry {
  id: string;
  contact: string;
  reason: string | null;
  created_at: string;
}

export type SignatureStatus = 'pendente' | 'assinado' | 'cancelado';

export interface ClinicSettings {
  id: string;
  clinic_name: string;
  cnpj: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  primary_color: string | null;
  updated_at: string;
}

export interface DocumentSignature {
  id: string;
  title: string;
  patient_id: string | null;
  status: SignatureStatus;
  document_url: string | null;
  signed_at: string | null;
  signer_id: string | null;
  signer_ip: string | null;
  content_hash: string | null;
  signature_data: string | null;
  created_at: string;
}
