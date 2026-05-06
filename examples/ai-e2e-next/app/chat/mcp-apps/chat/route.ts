import { openai } from '@ai-sdk/openai';
import { splitMCPAppTools } from '@ai-sdk/mcp';
import { convertToModelMessages, isStepCount, streamText } from 'ai';
import { createLocalMCPAppsClient } from '../mcp-client';

export async function POST(req: Request) {
  const requestUrl = new URL(req.url);

  const [client, { messages }] = await Promise.all([
    createLocalMCPAppsClient(requestUrl.origin),
    req.json(),
  ]);

  try {
    const { modelVisible } = splitMCPAppTools(await client.listTools());
    const tools = client.toolsFromDefinitions(modelVisible);

    const result = streamText({
      model: openai('gpt-4o-mini'),
      tools,
      stopWhen: isStepCount(5),
      messages: await convertToModelMessages(messages),
      onFinish: async () => {
        await client.close();
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    await client.close();
    console.error(error);
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
