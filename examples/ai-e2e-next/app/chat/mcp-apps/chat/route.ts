import { openai } from '@ai-sdk/openai';
import { createMCPClient, type ListToolsResult } from '@ai-sdk/mcp';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { convertToModelMessages, isStepCount, streamText } from 'ai';

function isModelVisibleTool(tool: ListToolsResult['tools'][number]) {
  const uiMeta = tool._meta?.ui;

  if (uiMeta == null || typeof uiMeta !== 'object' || Array.isArray(uiMeta)) {
    return true;
  }

  const visibility = (uiMeta as { visibility?: unknown }).visibility;

  return !Array.isArray(visibility) || visibility.includes('model');
}

export async function POST(req: Request) {
  const requestUrl = new URL(req.url);
  const url = new URL('/chat/mcp-apps/server', requestUrl.origin);
  const transport = new StreamableHTTPClientTransport(url);

  const [client, { messages }] = await Promise.all([
    createMCPClient({
      transport,
      clientName: 'local-mcp-apps',
      capabilities: {
        extensions: {
          'io.modelcontextprotocol/ui': {
            mimeTypes: ['text/html;profile=mcp-app'],
          },
        },
      },
    }),
    req.json(),
  ]);

  try {
    const toolDefinitions = await client.listTools();
    const modelToolDefinitions = {
      ...toolDefinitions,
      tools: toolDefinitions.tools.filter(isModelVisibleTool),
    };
    const tools = client.toolsFromDefinitions(modelToolDefinitions);

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
