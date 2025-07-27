import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient, stepCountIs, streamText } from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const mcpClient = await experimental_createMCPClient({
    transport: {
      type: 'sse',
      url: 'https://actions.zapier.com/mcp/[YOUR_KEY]/sse',
    },
  });

  try {
    const zapierTools = await mcpClient.tools();

    const result = streamText({
      model: openai('gpt-4o'),
      messages,
      tools: zapierTools,
      onFinish: async () => {
        await mcpClient.close();
      },
      stopWhen: stepCountIs(10),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    return new Response('Internal Server Error', { status: 500 });
  }
}
