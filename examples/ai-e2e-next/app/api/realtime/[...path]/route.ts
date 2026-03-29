import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { xai } from '@ai-sdk/xai';
import { tool, getRealtimeToolDefinitions, executeRealtimeTool } from 'ai';
import type {
  RealtimeFactory,
  RealtimeSessionConfig,
  RealtimeToolsExecuteRequestBody,
} from 'ai';
import { z } from 'zod';

const tools = {
  getWeather: tool({
    description: 'Get the current weather for a city',
    inputSchema: z.object({
      city: z.string().describe('The city to get weather for'),
    }),
    execute: async ({ city }) => {
      const conditions = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'];
      return {
        city,
        temperature: Math.floor(Math.random() * 35) + 5,
        condition: conditions[Math.floor(Math.random() * conditions.length)],
      };
    },
  }),
  rollDice: tool({
    description: 'Roll a six-sided die and return the result',
    inputSchema: z.object({}),
    execute: async () => ({
      result: Math.floor(Math.random() * 6) + 1,
    }),
  }),
};

const providers: Record<string, { factory: RealtimeFactory; model: string }> = {
  openai: { factory: openai.realtime, model: 'gpt-4o-realtime-preview' },
  google: {
    factory: google.realtime,
    model: 'gemini-3.1-flash-live-preview',
  },
  xai: {
    factory: xai.realtime,
    model: 'grok-3',
  },
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await params;
  const route = path.join('/');

  if (route === 'setup') {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider') ?? 'openai';

    const body = await request.json().catch(() => ({}));
    const sessionConfig: RealtimeSessionConfig | undefined =
      body.sessionConfig ?? undefined;

    const toolDefs = await getRealtimeToolDefinitions({ tools });

    const { factory, model } = providers[provider] ?? providers.openai;
    const tokenResult = await factory.getToken({
      model,
      sessionConfig: { ...sessionConfig, tools: toolDefs },
    });

    return Response.json({ ...tokenResult, tools: toolDefs });
  }

  if (route === 'execute-tools') {
    const { tools: toolsToExecute }: RealtimeToolsExecuteRequestBody =
      await request.json();

    const toolResults: Record<string, unknown> = {};

    for (const [key, toolData] of Object.entries(toolsToExecute)) {
      const result = await executeRealtimeTool({
        tools,
        name: toolData.name,
        arguments: (toolData.inputs as Record<string, unknown>) || {},
        callId: key,
      });
      toolResults[key] = result.success
        ? result.result
        : { error: result.error };
    }

    return Response.json(toolResults);
  }

  return new Response('Not found', { status: 404 });
}
