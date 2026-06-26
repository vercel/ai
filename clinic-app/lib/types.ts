export type UserRole = 'admin' | 'medico' | 'recepcao';
export type AppointmentStatus = 'agendado' | 'confirmado' | 'cancelado' | 'concluido';
export type InvoiceStatus = 'pendente' | 'pago' | 'cancelado';

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
}

export interface Invoice {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  amount_cents: number;
  status: InvoiceStatus;
  due_date: string | null;
  paid_at: string | null;
}
