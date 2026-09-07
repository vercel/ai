import { readFileSync } from 'node:fs';
import { createAnthropic } from '../../anthropic/dist/index.js';
import { tool } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { WorkflowAgent } from './workflow-agent.js';

const failureSignal =
  'ISSUE_20440_REPRODUCED: Anthropic rejected the provider-executed tool result replayed as a standalone tool message';

function toEventStream(chunks: string): string {
  return chunks
    .trim()
    .split('\n')
    .map(
      chunk =>
        `event: ${(JSON.parse(chunk) as { type: string }).type}\ndata: ${chunk}\n\n`,
    )
    .join('');
}

function finalTextStream(text: string): string {
  return toEventStream(
    [
      {
        type: 'message_start',
        message: {
          model: 'claude-sonnet-4-5-20250929',
          id: 'msg_final_20440',
          type: 'message',
          role: 'assistant',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 1,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            output_tokens: 1,
          },
        },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text },
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: {
          input_tokens: 1,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          output_tokens: 1,
        },
      },
      { type: 'message_stop' },
    ]
      .map(chunk => JSON.stringify(chunk))
      .join('\n'),
  );
}

describe('issue #20440', () => {
  it('replays Anthropic provider tool results in their assistant message', async () => {
    const firstResponse = readFileSync(
      new URL(
        './__fixtures__/issue-20440-anthropic-tool-search.chunks.txt',
        import.meta.url,
      ),
      'utf8',
    );
    const recordedError = readFileSync(
      new URL(
        './__fixtures__/issue-20440-anthropic-error.txt',
        import.meta.url,
      ),
      'utf8',
    ).trim();
    let requestCount = 0;

    const anthropic = createAnthropic({
      apiKey: 'test-api-key',
      fetch: async (_input, init) => {
        requestCount++;

        if (requestCount === 1) {
          return new Response(toEventStream(firstResponse), {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }

        const body = JSON.parse(String(init?.body)) as {
          messages: Array<{
            role: 'assistant' | 'user';
            content: Array<{
              type: string;
              tool_use_id?: string;
            }>;
          }>;
        };
        const serverToolCallId = 'srvtoolu_01Gj33J3YUAAxF9TWRAThxtu';
        const assistantHasProviderResult = body.messages.some(
          message =>
            message.role === 'assistant' &&
            message.content.some(
              part =>
                part.type === 'tool_search_tool_result' &&
                part.tool_use_id === serverToolCallId,
            ),
        );
        const userHasStandaloneProviderResult = body.messages.some(
          message =>
            message.role === 'user' &&
            message.content.some(
              part =>
                part.type === 'tool_result' &&
                part.tool_use_id === serverToolCallId,
            ),
        );

        if (!assistantHasProviderResult || userHasStandaloneProviderResult) {
          return new Response(
            JSON.stringify({
              type: 'error',
              error: {
                type: 'invalid_request_error',
                message: recordedError,
              },
            }),
            {
              status: 400,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        return new Response(finalTextStream('The weather is 64°F.'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      },
    });
    const resultPromise = new WorkflowAgent({
      model: anthropic('claude-sonnet-4-5'),
      tools: {
        toolSearch: anthropic.tools.toolSearchBm25_20251119(),
        get_weather: tool({
          description: 'Get the current weather at a specific location',
          inputSchema: z.object({ location: z.string() }),
          execute: async ({ location }) => ({
            location,
            temperature: 64,
          }),
          providerOptions: {
            anthropic: { deferLoading: true },
          },
        }),
      },
    }).stream({
      messages: [
        {
          role: 'user',
          content: 'Get the weather in San Francisco.',
        },
      ],
    });

    try {
      const result = await resultPromise;
      expect(result.steps).toHaveLength(2);
      expect(result.steps.at(-1)?.text).toBe('The weather is 64°F.');
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes(
          'unexpected `tool_use_id` found in `tool_result` blocks',
        )
      ) {
        throw new Error(failureSignal);
      }
      throw error;
    }
  });
});
