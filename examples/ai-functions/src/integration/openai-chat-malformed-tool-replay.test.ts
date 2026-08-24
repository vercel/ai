import { createOpenAI } from '@ai-sdk/openai';
import { parseJSON } from '@ai-sdk/provider-utils';
import { convertToModelMessages, generateText } from 'ai';
import { describe, expect, it, vi } from 'vitest';

describe('OpenAI Chat Completions persisted tool replay', () => {
  it('serializes malformed tool input as an object and preserves the tool error', async () => {
    let requestBody: unknown;
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = await parseJSON({ text: String(init?.body) });

        return new Response(
          JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: 0,
            model: 'gpt-4o-mini',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Retrying the tool call.',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 1,
              completion_tokens: 1,
              total_tokens: 2,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      },
    );

    const model = createOpenAI({
      apiKey: 'test-api-key',
      fetch: fetchMock,
    }).chat('gpt-4o-mini');

    const messages = await convertToModelMessages([
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool-set_cell_range',
            toolCallId: 'call_1',
            state: 'output-error',
            input: undefined,
            rawInput: '{"label":"Build sheet",',
            errorText: 'Invalid input: JSON parsing failed',
          },
        ],
      },
    ]);

    await generateText({ model, messages });

    const { messages: requestMessages } = requestBody as {
      messages: Array<{
        role: string;
        content: string | null;
        tool_call_id?: string;
        tool_calls?: Array<{
          function: { arguments: string };
        }>;
      }>;
    };

    const assistantMessage = requestMessages.find(
      message => message.role === 'assistant',
    );
    const toolMessage = requestMessages.find(
      message => message.role === 'tool',
    );
    const serializedArguments =
      assistantMessage?.tool_calls?.[0]?.function.arguments;
    const decodedArguments = await parseJSON({
      text: serializedArguments ?? 'null',
    });

    expect(decodedArguments).toEqual({});
    expect(decodedArguments).not.toBeNull();
    expect(Array.isArray(decodedArguments)).toBe(false);
    expect(toolMessage).toMatchObject({
      role: 'tool',
      tool_call_id: 'call_1',
      content: 'Invalid input: JSON parsing failed',
    });
  });
});
