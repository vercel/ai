import { createOpenAI } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';

async function main() {
  let requestBody: Record<string, unknown> | undefined;
  let responseBody: unknown;

  const openai = createOpenAI({
    fetch: async (url, init) => {
      requestBody = JSON.parse(String(init?.body));
      const response = await fetch(url, init);

      try {
        responseBody = await response.clone().json();
      } catch {
        responseBody = await response.clone().text();
      }

      return response;
    },
  });

  try {
    await generateText({
      model: openai.responses('gpt-5.4-mini'),
      tools: {
        tool_search: tool({
          description: 'Search synthetic records',
          inputSchema: z.object({
            query: z.string(),
            limit: z.number(),
          }),
          execute: async () => 'No matches',
        }),
      },
      messages: [
        {
          role: 'user',
          content: 'Search the synthetic records.',
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_123',
              toolName: 'tool_search',
              input: {
                query: 'synthetic query',
                limit: 10,
              },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_123',
              toolName: 'tool_search',
              output: {
                type: 'json',
                value: { tools: [] },
              },
            },
          ],
        },
      ],
    });
  } catch (error) {
    const input = requestBody?.input;
    const tools = requestBody?.tools;
    const toolDefinition = Array.isArray(tools)
      ? tools.find(
          item =>
            typeof item === 'object' &&
            item != null &&
            'name' in item &&
            item.name === 'tool_search',
        )
      : undefined;
    const replayedCall = Array.isArray(input)
      ? input.find(
          item =>
            typeof item === 'object' &&
            item != null &&
            'type' in item &&
            item.type === 'tool_search_call',
        )
      : undefined;
    const responseText = JSON.stringify(responseBody);

    if (
      typeof toolDefinition === 'object' &&
      toolDefinition != null &&
      'type' in toolDefinition &&
      toolDefinition.type === 'function' &&
      typeof replayedCall === 'object' &&
      replayedCall != null &&
      !('arguments' in replayedCall) &&
      responseText.includes('Missing required parameter') &&
      responseText.includes('arguments')
    ) {
      console.error(
        'ISSUE_17402_REPRODUCED: regular function tool_search was replayed as tool_search_call without arguments and OpenAI rejected the request',
      );
      console.error(
        JSON.stringify({ toolDefinition, replayedCall, responseBody }, null, 2),
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  throw new Error(
    `ISSUE_17402_NOT_REPRODUCED: request completed; body=${JSON.stringify(requestBody)}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
