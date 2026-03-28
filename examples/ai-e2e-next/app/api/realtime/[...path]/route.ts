import { openai } from '@ai-sdk/openai';
import { tool, ToolExecutionOptions } from 'ai';
import { prepareToolsAndToolChoice } from 'ai/internal';
import type { RealtimeToolsExecuteRequestBody } from 'ai';
import { z } from 'zod';

const tools = {
  getLocation: tool({
    description: 'Get the current location of the user.',
    inputSchema: z.object({}),
    execute: async () => {
      const cities = ['New York', 'London', 'Tokyo', 'Paris', 'Berlin'];
      return {
        location: cities[Math.floor(Math.random() * cities.length)],
      };
    },
  }),
  getWeather: tool({
    description: 'Get the weather for a given location.',
    inputSchema: z.object({
      location: z.string().describe('The city to get weather for'),
    }),
    execute: async ({ location }) => {
      const conditions = ['sunny', 'cloudy', 'rainy', 'snowy'];
      return {
        location,
        condition: conditions[Math.floor(Math.random() * conditions.length)],
        temperature: Math.floor(Math.random() * 35) + 5,
      };
    },
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
