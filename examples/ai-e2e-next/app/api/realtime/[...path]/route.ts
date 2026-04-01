import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { xai } from '@ai-sdk/xai';
import { elevenlabs } from '@ai-sdk/elevenlabs';
import {
  tool,
  getRealtimeToolDefinitions,
  executeRealtimeTool,
  createRealtimeToolToken,
  verifyRealtimeToolToken,
} from 'ai';
import type {
  RealtimeFactory,
  RealtimeSessionConfig,
  RealtimeToolsExecuteRequestBody,
} from 'ai';
import { z } from 'zod';

const REALTIME_SECRET = process.env.AI_REALTIME_SECRET ?? '';

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
  elevenlabs: {
    factory: elevenlabs.realtime,
    model: process.env.ELEVENLABS_AGENT_ID ?? '',
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

    // Create an HMAC-signed token authorizing execution of these tools
    const toolToken = REALTIME_SECRET
      ? await createRealtimeToolToken({
          tools: Object.keys(tools),
          secret: REALTIME_SECRET,
        })
      : undefined;

    return Response.json({ ...tokenResult, tools: toolDefs, toolToken });
  }

  if (route === 'execute-tools') {
    const { toolToken, tools: toolsToExecute }: RealtimeToolsExecuteRequestBody =
      await request.json();

    // Verify the HMAC-signed tool token before executing anything
    if (REALTIME_SECRET) {
      const verification = await verifyRealtimeToolToken({
        token: toolToken ?? '',
        secret: REALTIME_SECRET,
        toolNames: Object.values(toolsToExecute).map(t => t.name),
      });

      if (!verification.valid) {
        return Response.json(
          { error: verification.error },
          { status: 403 },
        );
      }
    }

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await params;
  const route = path.join('/');

  if (route === 'elevenlabs-voices') {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return Response.json({ voices: [] });
    }

    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      return Response.json({ voices: [] });
    }

    const data = (await response.json()) as {
      voices: Array<{ voice_id: string; name: string; category?: string }>;
    };

    const voices = data.voices.map(v => ({
      id: v.voice_id,
      label: v.name,
      category: v.category,
    }));

    return Response.json({ voices });
  }

  return new Response('Not found', { status: 404 });
}
