import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface DueReminder {
  appointment_id: string;
  scheduled_at: string;
  patient_name: string;
  patient_phone: string;
  professional_name: string;
  whatsapp_instance_url: string;
  whatsapp_api_token: string;
}

function buildMessage(reminder: DueReminder) {
  const time = new Date(reminder.scheduled_at).toLocaleString('pt-BR', {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `Olá ${reminder.patient_name.split(' ')[0]}, lembramos da sua consulta ${time} com ${reminder.professional_name}.`;
}

/**
 * Sends the reminder through the clinic's own WhatsApp gateway instance
 * (Evolution API, Z-API, or any compatible provider) — a generic
 * `{ phone, message }` JSON POST authenticated with the clinic's own token.
 * Different gateways expect the payload/header shape slightly differently;
 * adapt this function per provider if needed.
 */
async function sendWhatsappMessage(reminder: DueReminder) {
  const response = await fetch(reminder.whatsapp_instance_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${reminder.whatsapp_api_token}`,
    },
    body: JSON.stringify({
      phone: reminder.patient_phone,
      message: buildMessage(reminder),
    }),
  });

  return response.ok;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();

  const { data: reminders, error } = await supabase.rpc('get_due_whatsapp_reminders', {
    p_secret: process.env.CRON_SECRET,
  });

  if (error) {
    return NextResponse.json({ error: 'failed to load due reminders' }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const reminder of (reminders ?? []) as DueReminder[]) {
    const ok = await sendWhatsappMessage(reminder);

    if (ok) {
      await supabase.rpc('mark_whatsapp_reminder_sent', {
        p_secret: process.env.CRON_SECRET,
        p_appointment_id: reminder.appointment_id,
      });
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, sent, failed, total: (reminders ?? []).length });
}
