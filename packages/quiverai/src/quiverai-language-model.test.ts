import {
  InvalidArgumentError,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createQuiverAI } from './quiverai-provider';

const URL = 'https://api.quiver.ai/v1/responses';
const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Create an icon.' }] },
];

const server = createTestServer({
  [URL]: {},
});

function createResponse({
  output,
  status = 'completed',
  incompleteReason,
}: {
  output: Array<Record<string, unknown>>;
  status?: string;
  incompleteReason?: string;
}) {
  return {
    id: 'resp_1',
    object: 'response',
    created_at: 1_700_000_000,
    model: 'arrow-2',
    status,
    ...(incompleteReason != null
      ? { incomplete_details: { reason: incompleteReason } }
      : {}),
    output,
    usage: {
      input_tokens: 20,
      input_tokens_details: {
        cached_tokens: 5,
        cache_write_tokens: 3,
      },
      output_tokens: 12,
      output_tokens_details: { reasoning_tokens: 4 },
      total_tokens: 32,
    },
  };
}

describe('QuiverAI language model', () => {
  it('preserves QuiverAI HTTP error messages with nullable fields', async () => {
    server.urls[URL].response = {
      type: 'error',
      status: 400,
      body: JSON.stringify({
        error: {
          message: 'store must be false',
          type: 'invalid_request_error',
          param: null,
          code: 'invalid_request',
        },
      }),
    };

    await expect(
      createQuiverAI({ apiKey: 'test-api-key' })('arrow-2').doGenerate({
        prompt,
      }),
    ).rejects.toThrow('store must be false');
  });

  it('generates text through the stateless Responses endpoint', async () => {
    server.urls[URL].response = {
      type: 'json-value',
      body: createResponse({
        output: [
          {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                text: 'Use a simple blue compass.',
                annotations: [],
              },
            ],
          },
        ],
      }),
    };

    const result = await createQuiverAI({ apiKey: 'test-api-key' })(
      'arrow-2',
    ).doGenerate({
      prompt,
      providerOptions: {
        quiverai: {
          reasoningEffort: 'high',
          reasoningSummary: 'auto',
        },
      },
    });

    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Use a simple blue compass.',
        providerMetadata: {
          quiverai: { itemId: 'msg_1' },
        },
      },
    ]);
    expect(result.finishReason).toEqual({ unified: 'stop', raw: undefined });
    expect(result.usage).toEqual({
      inputTokens: {
        total: 20,
        noCache: 12,
        cacheRead: 5,
        cacheWrite: 3,
      },
      outputTokens: { total: 12, text: 8, reasoning: 4 },
      raw: expect.any(Object),
    });

    expect(server.calls[0].requestUrl).toBe(URL);
    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
    });
    expect(server.calls[0].requestUserAgent).toContain('ai-sdk/quiverai/');
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'arrow-2',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Create an icon.' }],
        },
      ],
      reasoning: { effort: 'high', summary: 'auto' },
    });
  });

  it('replays opaque reasoning ids without private or encrypted reasoning', async () => {
    server.urls[URL].response = {
      type: 'json-value',
      body: createResponse({ output: [] }),
    };

    await createQuiverAI({ apiKey: 'test-api-key' })('arrow-2').doGenerate({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'reasoning',
              text: 'private reasoning',
              providerOptions: {
                quiverai: {
                  itemId: 'rs_opaque',
                  reasoningSummary: [
                    { type: 'summary_text', text: 'safe summary' },
                  ],
                  reasoningContent: [
                    { type: 'reasoning_text', text: 'private reasoning' },
                  ],
                  reasoningEncryptedContent: 'encrypted',
                },
              },
            },
            {
              type: 'tool-call',
              toolCallId: 'call_1',
              toolName: 'write_file',
              input: '{"path":"icon.svg"}',
              providerOptions: { quiverai: { itemId: 'fc_1' } },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_1',
              toolName: 'write_file',
              output: { type: 'json', value: { staged: true } },
            },
          ],
        },
      ],
    });

    expect((await server.calls[0].requestBodyJson).input).toEqual([
      {
        type: 'reasoning',
        id: 'rs_opaque',
        summary: [{ type: 'summary_text', text: 'safe summary' }],
      },
      {
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call_1',
        name: 'write_file',
        arguments: '{"path":"icon.svg"}',
      },
      {
        type: 'function_call_output',
        call_id: 'call_1',
        output: '{"staged":true}',
      },
    ]);
  });

  it('warns and omits structured output settings', async () => {
    server.urls[URL].response = {
      type: 'json-value',
      body: createResponse({ output: [] }),
    };

    const result = await createQuiverAI({ apiKey: 'test-api-key' })(
      'arrow-2',
    ).doGenerate({
      prompt,
      responseFormat: {
        type: 'json',
        schema: { type: 'object' },
      },
    });

    expect(result.warnings).toContainEqual({
      type: 'unsupported',
      feature: 'responseFormat',
    });
    expect((await server.calls[0].requestBodyJson).text).toBeUndefined();
  });

  it('validates QuiverAI reasoning values', async () => {
    await expect(
      createQuiverAI({ apiKey: 'test-api-key' })('arrow-2').doGenerate({
        prompt,
        providerOptions: {
          quiverai: { reasoningEffort: 'max' },
        },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('streams complete function calls and terminal usage', async () => {
    const completedResponse = createResponse({
      output: [
        {
          id: 'fc_1',
          type: 'function_call',
          status: 'completed',
          call_id: 'call_1',
          name: 'write_file',
          arguments: '{"path":"icon.svg"}',
        },
      ],
    });
    server.urls[URL].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          type: 'response.output_item.added',
          sequence_number: 0,
          output_index: 0,
          item: {
            id: 'fc_1',
            type: 'function_call',
            status: 'in_progress',
            call_id: 'call_1',
            name: 'write_file',
            arguments: '',
          },
        })}\n\n`,
        `data: ${JSON.stringify({
          type: 'response.function_call_arguments.delta',
          sequence_number: 1,
          item_id: 'fc_1',
          output_index: 0,
          call_id: 'call_1',
          delta: '{"path":',
        })}\n\n`,
        `data: ${JSON.stringify({
          type: 'response.function_call_arguments.done',
          sequence_number: 2,
          item_id: 'fc_1',
          output_index: 0,
          call_id: 'call_1',
          arguments: '{"path":"icon.svg"}',
        })}\n\n`,
        `data: ${JSON.stringify({
          type: 'response.output_item.done',
          sequence_number: 3,
          output_index: 0,
          item: completedResponse.output[0],
        })}\n\n`,
        `data: ${JSON.stringify({
          type: 'response.completed',
          sequence_number: 4,
          response: completedResponse,
        })}\n\n`,
        'data: [DONE]\n\n',
      ],
    };

    const result = await createQuiverAI({ apiKey: 'test-api-key' })(
      'arrow-2-telos',
    ).doStream({ prompt });
    const parts = await convertReadableStreamToArray(result.stream);

    expect(parts).toContainEqual({
      type: 'tool-call',
      toolCallId: 'call_1',
      toolName: 'write_file',
      input: '{"path":"icon.svg"}',
      providerMetadata: { quiverai: { itemId: 'fc_1' } },
    });
    expect(parts.at(-1)).toEqual({
      type: 'finish',
      finishReason: { unified: 'tool-calls', raw: undefined },
      usage: {
        inputTokens: {
          total: 20,
          noCache: 12,
          cacheRead: 5,
          cacheWrite: 3,
        },
        outputTokens: { total: 12, text: 8, reasoning: 4 },
        raw: completedResponse.usage,
      },
      providerMetadata: undefined,
    });
  });

  it('supports caller-executed custom tools', async () => {
    server.urls[URL].response = {
      type: 'json-value',
      body: createResponse({
        output: [
          {
            id: 'ct_1',
            type: 'custom_tool_call',
            status: 'completed',
            call_id: 'call_custom_1',
            name: 'write_svg',
            input: '<svg />',
          },
        ],
      }),
    };
    const provider = createQuiverAI({ apiKey: 'test-api-key' });
    const result = await provider('arrow-2').doGenerate({
      prompt,
      tools: [
        {
          type: 'provider',
          id: 'quiverai.custom',
          name: 'write_svg',
          args: {
            description: 'Return SVG source.',
            format: { type: 'text' },
          },
        },
      ],
      toolChoice: { type: 'tool', toolName: 'write_svg' },
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.tools).toEqual([
      {
        type: 'custom',
        name: 'write_svg',
        description: 'Return SVG source.',
        format: { type: 'text' },
      },
    ]);
    expect(requestBody.tool_choice).toEqual({
      type: 'custom',
      name: 'write_svg',
    });
    expect(result.content).toContainEqual({
      type: 'tool-call',
      toolCallId: 'call_custom_1',
      toolName: 'write_svg',
      input: '"<svg />"',
      providerMetadata: { quiverai: { itemId: 'ct_1' } },
    });
  });
});
