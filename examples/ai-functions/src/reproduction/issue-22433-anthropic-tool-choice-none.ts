import 'dotenv/config';
import { createAnthropic } from '@ai-sdk/anthropic';
import { APICallError, generateText, tool, type ModelMessage } from 'ai';
import { z } from 'zod/v4';

const modelId = 'claude-opus-5-5';
const serverToolCallId = 'srvtoolu_011Jcb838xqvZyWwDt7bWqAz';

const messages: ModelMessage[] = [
  {
    role: 'user',
    content: 'Find a weather tool.',
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: serverToolCallId,
        toolName: 'tool_search',
        input: {
          query: 'weather current conditions San Francisco',
        },
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: serverToolCallId,
        toolName: 'tool_search',
        output: {
          type: 'json',
          value: [
            {
              type: 'tool_reference',
              toolName: 'get_weather',
            },
          ],
        },
      },
    ],
  },
  {
    role: 'user',
    content: 'Write the final answer without calling any tools.',
  },
];

const tools = {
  tool_search: createAnthropic().tools.toolSearchBm25_20251119(),
  get_weather: tool({
    description: 'Get the current weather at a specific location.',
    inputSchema: z.object({
      location: z.string(),
    }),
    execute: async ({ location }) => ({
      location,
      weather: 'Sunny',
    }),
    providerOptions: {
      anthropic: {
        deferLoading: true,
      },
    },
  }),
};

async function verifyNativeToolChoiceNone(): Promise<void> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Find a weather tool.' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'server_tool_use',
              id: serverToolCallId,
              name: 'tool_search_tool_bm25',
              input: {
                query: 'weather current conditions San Francisco',
              },
              caller: { type: 'direct' },
            },
            {
              type: 'tool_search_tool_result',
              tool_use_id: serverToolCallId,
              content: {
                type: 'tool_search_tool_search_result',
                tool_references: [
                  {
                    type: 'tool_reference',
                    tool_name: 'get_weather',
                  },
                ],
              },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Write the final answer without calling any tools.',
            },
          ],
        },
      ],
      tools: [
        {
          type: 'tool_search_tool_bm25_20251119',
          name: 'tool_search_tool_bm25',
        },
        {
          name: 'get_weather',
          description: 'Get the current weather at a specific location.',
          input_schema: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
            required: ['location'],
            additionalProperties: false,
          },
          defer_loading: true,
        },
      ],
      tool_choice: { type: 'none' },
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Native Anthropic tool_choice none baseline failed (${response.status}): ${body}`,
    );
  }

  console.log(
    'Native Anthropic baseline kept tools with tool_choice none and succeeded.',
  );
}

async function main(): Promise<void> {
  await verifyNativeToolChoiceNone();

  let requestBody: Record<string, unknown> | undefined;
  const anthropic = createAnthropic({
    fetch: async (input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return fetch(input, init);
    },
  });

  try {
    await generateText({
      model: anthropic(modelId),
      maxOutputTokens: 512,
      messages,
      tools,
      toolChoice: 'none',
    });
  } catch (error) {
    if (
      APICallError.isInstance(error) &&
      error.statusCode === 400 &&
      error.responseBody?.includes(
        "Tool reference 'get_weather' not found in available tools",
      ) &&
      requestBody?.tools == null &&
      requestBody?.tool_choice == null
    ) {
      console.error(
        "ISSUE_22433_REPRODUCED: toolChoice 'none' dropped tools and invalidated tool-search history",
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

await main();
