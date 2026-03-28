import { generateRealtimeToken } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST() {
  const result = await generateRealtimeToken({
    model: openai.realtime('gpt-4o-realtime-preview'),
  });

  return Response.json(result);
}
