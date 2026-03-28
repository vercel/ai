import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { tool, ToolExecutionOptions } from 'ai';
import { prepareToolsAndToolChoice } from 'ai/internal';
import type { RealtimeToolsExecuteRequestBody } from 'ai';
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

const providerConfig = {
  openai: {
    getToken: async (opts: {
      preparedTools: Awaited<ReturnType<typeof prepareToolsAndToolChoice>>;
      sessionConfig?: Record<string, unknown>;
    }) =>
      openai.realtime.getToken({
        model: 'gpt-4o-realtime-preview',
        tools: opts.preparedTools.tools,
        toolChoice: opts.preparedTools.toolChoice,
      }),
  },
  google: {
    getToken: async (opts: {
      preparedTools: Awaited<ReturnType<typeof prepareToolsAndToolChoice>>;
      sessionConfig?: Record<string, unknown>;
    }) =>
      google.realtime.getToken({
        model: 'gemini-3.1-flash-live-preview',
        tools: opts.preparedTools.tools,
        toolChoice: opts.preparedTools.toolChoice,
        sessionConfig: opts.sessionConfig,
      }),
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
    const sessionConfig = body.sessionConfig ?? undefined;

    const preparedTools = await prepareToolsAndToolChoice({
      tools,
      toolChoice: undefined,
      activeTools: undefined,
    });

    const config =
      providerConfig[provider as keyof typeof providerConfig] ??
      providerConfig.openai;

    const tokenResult = await config.getToken({
      preparedTools,
      sessionConfig,
    });

    return Response.json(tokenResult);
  }

  if (route === 'execute-tools') {
    const { tools: toolsToExecute }: RealtimeToolsExecuteRequestBody =
      await request.json();

    const toolResults: Record<string, unknown> = {};

    for (const [key, toolData] of Object.entries(toolsToExecute)) {
      if (toolData.name in tools) {
        const toolFn = tools[toolData.name as keyof typeof tools];
        if (toolFn?.execute) {
          const result = await toolFn.execute(
            (toolData.inputs as any) || {},
            {} as ToolExecutionOptions,
          );
          toolResults[key] = result;
        } else {
          toolResults[key] = { error: 'Tool execute not found' };
        }
      } else {
        toolResults[key] = { error: 'Tool not found' };
      }
    }

    return Response.json(toolResults);
  }

  return new Response('Not found', { status: 404 });
}
