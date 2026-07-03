import { NextRequest, NextResponse } from 'next/server';
import { type ModelMessage } from 'ai';
import { z } from 'zod';
import { createWhatsappSchedulingAgent } from '@/lib/agents/whatsapp-scheduling-agent';

const historyItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const requestSchema = z.object({
  clinic_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  message: z.string().min(1),
  // Prior turns of this WhatsApp conversation, oldest first. Persistence is
  // owned by the caller (e.g. the conversations/conversation_messages tables
  // already used elsewhere in the app) — this route is a stateless "brain".
  conversation_history: z.array(historyItemSchema).default([]),
});

/**
 * WhatsApp scheduling agent.
 *
 * Receives one inbound patient message (plus prior turns for context) and
 * returns the agent's reply. The agent has exactly two tools — checking real
 * availability and booking — so it can never invent a time slot or write to
 * any other table. Booking only happens after the patient explicitly
 * confirms a slot the agent already showed them.
 *
 * Auth: called by your WhatsApp integration layer (Meta Cloud API, Twilio,
 * Z-API, ...) after it has already resolved which clinic/patient the
 * incoming phone number belongs to. Protected by a shared secret rather than
 * a Supabase session, since there is no logged-in user on this path.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret');
  if (!secret || secret !== process.env.WHATSAPP_AGENT_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { clinic_id, patient_id, message, conversation_history } = parsed.data;

  const messages: ModelMessage[] = [
    ...conversation_history.map((turn) => ({ role: turn.role, content: turn.content }) as ModelMessage),
    { role: 'user', content: message },
  ];

  try {
    const agent = createWhatsappSchedulingAgent({
      clinicId: clinic_id,
      webhookSecret: secret,
      patientId: patient_id,
    });
    const result = await agent.generate({ messages });

    return NextResponse.json({ reply: result.text });
  } catch (error) {
    console.error('whatsapp-agent generation failed', error);
    return NextResponse.json(
      { error: 'Não consegui processar sua mensagem agora. Tente novamente em instantes.' },
      { status: 500 },
    );
  }
}
