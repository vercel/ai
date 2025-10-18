import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, stepCountIs, streamText } from 'ai';
import { experimental_createMCPClient } from '@ai-sdk/mcp';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const mcpClient = await experimental_createMCPClient({
    transport: {
      type: 'http',
      url: 'https://mcp.zapier.com/api/mcp/s/[YOUR_SERVER_ID]/mcp',
    },
  });

  try {
    const zapierTools = await mcpClient.tools();

    const result = streamText({
      model: openai('gpt-4o'),
      messages: convertToModelMessages(messages),
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
