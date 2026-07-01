import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

/**
 * Server-side values every scheduling tool needs but that must never be
 * inferred or repeated by the model: which clinic this WhatsApp
 * conversation belongs to, and the shared secret that authorizes the
 * SECURITY DEFINER RPCs (whatsapp_get_available_slots / whatsapp_book_appointment)
 * to bypass RLS for this one, narrowly-scoped operation.
 */
export interface SchedulingToolsContext {
  clinicId: string;
  webhookSecret: string;
  /**
   * The patient already identified by the WhatsApp integration layer (via
   * phone number lookup) for this conversation. Deliberately NOT an
   * argument the model supplies to book_appointment: never trust the LLM
   * to produce the correct patient UUID, since a hallucinated or misread
   * id would book the appointment onto the wrong patient's record.
   */
  patientId: string;
}

function supabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

function getAvailableSlotsTool({ clinicId, webhookSecret }: SchedulingToolsContext) {
  return tool({
    description:
      'Consulta os horários realmente livres de um profissional em uma data específica. ' +
      'Use esta ferramenta SEMPRE antes de sugerir qualquer horário ao paciente — nunca invente ' +
      'ou estime disponibilidade de memória.',
    inputSchema: z.object({
      doctor_id: z.string().uuid().describe('ID do profissional (médico/terapeuta) na clínica'),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe('Data desejada no formato YYYY-MM-DD'),
      duration_minutes: z
        .number()
        .int()
        .positive()
        .default(30)
        .describe('Duração da consulta em minutos'),
    }),
    execute: async ({ doctor_id, date, duration_minutes }) => {
      const supabase = supabaseClient();

      const { data, error } = await supabase.rpc('whatsapp_get_available_slots', {
        p_secret: webhookSecret,
        p_clinic_id: clinicId,
        p_professional_id: doctor_id,
        p_date: date,
        p_duration_minutes: duration_minutes,
      });

      if (error) {
        return { ok: false as const, error: error.message, slots: [] };
      }

      const slots = (data ?? []) as { slot_start: string; slot_end: string }[];

      return {
        ok: true as const,
        date,
        duration_minutes,
        slots: slots.map((s) => s.slot_start),
      };
    },
  });
}

function bookAppointmentTool({ clinicId, webhookSecret, patientId }: SchedulingToolsContext) {
  return tool({
    description:
      'Efetiva o agendamento de uma consulta, gravando-a no banco de dados da clínica, para o ' +
      'paciente desta conversa. NUNCA chame esta ferramenta sem antes ter mostrado o horário ao ' +
      'paciente através de get_available_slots e recebido uma confirmação explícita e inequívoca ' +
      'dele (ex: "sim", "pode confirmar", "fechado"). Se o paciente ainda não confirmou, não ' +
      'chame esta ferramenta.',
    inputSchema: z.object({
      doctor_id: z.string().uuid().describe('ID do profissional (médico/terapeuta)'),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe('Data do agendamento no formato YYYY-MM-DD'),
      time: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .describe('Horário do agendamento no formato HH:mm, deve ser um horário retornado por get_available_slots'),
      duration_minutes: z.number().int().positive().default(30),
    }),
    execute: async ({ doctor_id, date, time, duration_minutes }) => {
      const supabase = supabaseClient();
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();

      const { data, error } = await supabase
        .rpc('whatsapp_book_appointment', {
          p_secret: webhookSecret,
          p_clinic_id: clinicId,
          p_patient_id: patientId,
          p_professional_id: doctor_id,
          p_scheduled_at: scheduledAt,
          p_duration_minutes: duration_minutes,
        })
        .single<{ success: boolean; appointment_id: string | null; message: string }>();

      if (error) {
        return { ok: false as const, error: error.message };
      }

      return {
        ok: data.success,
        appointment_id: data.appointment_id,
        message: data.message,
      };
    },
  });
}

/**
 * Builds the two scheduling tools bound to one WhatsApp conversation's
 * clinic. Built per-request (cheap, no I/O) rather than as module-level
 * singletons, since clinicId varies per tenant.
 */
export function createSchedulingTools(context: SchedulingToolsContext) {
  return {
    get_available_slots: getAvailableSlotsTool(context),
    book_appointment: bookAppointmentTool(context),
  };
}
