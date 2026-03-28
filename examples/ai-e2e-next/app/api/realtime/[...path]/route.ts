import { openai } from '@ai-sdk/openai';
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await params;
  const route = path.join('/');

  if (route === 'setup') {
    const preparedTools = await prepareToolsAndToolChoice({
      tools,
      toolChoice: undefined,
      activeTools: undefined,
    });

    const tokenResult = await openai.realtime.getToken({
      model: 'gpt-4o-realtime-preview',
      tools: preparedTools.tools,
      toolChoice: preparedTools.toolChoice,
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
