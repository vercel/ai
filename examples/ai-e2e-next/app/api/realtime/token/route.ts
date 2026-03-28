import {
  generateRealtimeToken,
  getRealtimeToolDefinitions,
  RealtimeSessionConfig,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { xai } from '@ai-sdk/xai';
import { google } from '@ai-sdk/google';
import { tools } from '../tools/route';

const models = {
  openai: openai.realtime('gpt-4o-realtime-preview'),
  xai: xai.realtime('grok-3'),
  google: google.realtime('gemini-3.1-flash-live-preview'),
};

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider') ?? 'xai';
  const model = models[provider as keyof typeof models] ?? models.xai;

  const body = await request.json().catch(() => ({}));
  let sessionConfig: RealtimeSessionConfig | undefined =
    body.sessionConfig ?? undefined;

  if (provider === 'google' && sessionConfig != null) {
    const toolDefs = await getRealtimeToolDefinitions({ tools });
    sessionConfig = { ...sessionConfig, tools: toolDefs };
  }

  const result = await generateRealtimeToken({ model, sessionConfig });

  return Response.json(result);
}
