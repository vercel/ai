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
  created_at: string;
}

export interface Patient {
  id: string;
  full_name: string;
  cpf: string | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
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
  created_at: string;
}

export interface Appointment {
  id: string;
  patient_id: string;
  professional_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  amount_cents: number;
  status: InvoiceStatus;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
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

export interface DocumentSignature {
  id: string;
  title: string;
  patient_id: string | null;
  status: SignatureStatus;
  document_url: string | null;
  signed_at: string | null;
  created_at: string;
}
