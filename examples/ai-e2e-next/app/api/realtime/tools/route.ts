import { getRealtimeToolDefinitions, executeRealtimeTool, tool } from 'ai';
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
        temperature: 45,
        condition: 'rainy as f',
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

export async function GET() {
  const definitions = await getRealtimeToolDefinitions({ tools });
  return Response.json(definitions);
}

export async function POST(request: Request) {
  const { name, arguments: args, callId } = await request.json();

  console.log(`[realtime/tools] executing: ${name}`, args);

  const result = await executeRealtimeTool({
    tools,
    name,
    arguments: args,
    callId,
  });

  console.log(`[realtime/tools] result:`, result);

  return Response.json(result);
}
