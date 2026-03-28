import { generateRealtimeToken } from 'ai';
import { openai } from '@ai-sdk/openai';
import { xai } from '@ai-sdk/xai';

const models = {
  openai: openai.realtime('gpt-4o-realtime-preview'),
  xai: xai.realtime('grok-3'),
};

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider') ?? 'xai';
  const model = models[provider as keyof typeof models] ?? models.xai;

  const result = await generateRealtimeToken({ model });

  return Response.json(result);
}
