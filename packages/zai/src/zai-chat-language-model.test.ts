import type {
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { ZaiLanguageModelChatOptions } from './index';
import { ZaiChatLanguageModel } from './zai-chat-language-model';
import { createZai } from './zai-provider';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const SUCCESS_RESPONSE = {
  id: 'chatcmpl-123',
  request_id: 'request-123',
  created: 1_777_000_000,
  model: 'glm-5.3',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'The answer is 42.',
        reasoning_content: 'I should calculate the answer.',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'calculator', arguments: '{"value":42}' },
          },
        ],
      },
      finish_reason: 'tool_calls',
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 7,
    prompt_tokens_details: { cached_tokens: 3 },
    total_tokens: 17,
  },
};

function createJsonFetch(response: unknown = SUCCESS_RESPONSE, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(response), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

async function streamToArray(
  stream: ReadableStream<LanguageModelV4StreamPart>,
) {
  const parts: LanguageModelV4StreamPart[] = [];
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
  }

  return parts;
}

describe('ZaiChatLanguageModel', () => {
  it('maps Z.AI provider options and omits unsupported standard options', async () => {
    const fetch = createJsonFetch();
    const model = createZai({ apiKey: 'test-key', fetch })('glm-5.3');

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
      frequencyPenalty: 0.2,
      presencePenalty: 0.3,
      seed: 42,
      reasoning: 'low',
      toolChoice: { type: 'required' },
      tools: [
        {
          type: 'function',
          name: 'calculator',
          description: 'Calculate a value',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      providerOptions: {
        zai: {
          doSample: false,
          thinking: { type: 'enabled', clearThinking: false },
          reasoningEffort: 'max',
          toolStream: true,
          requestId: 'request-123456',
          userId: 'user-123456',
          ignoredOption: true,
        },
      },
    });

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'glm-5.3',
      do_sample: false,
      thinking: { type: 'enabled', clear_thinking: false },
      reasoning_effort: 'max',
      tool_stream: true,
      request_id: 'request-123456',
      user_id: 'user-123456',
    });
    expect(body).not.toHaveProperty('frequency_penalty');
    expect(body).not.toHaveProperty('presence_penalty');
    expect(body).not.toHaveProperty('seed');
    expect(body).not.toHaveProperty('ignoredOption');
    expect(body).not.toHaveProperty('tool_choice');
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        { type: 'unsupported', feature: 'frequencyPenalty' },
        { type: 'unsupported', feature: 'presencePenalty' },
        { type: 'unsupported', feature: 'seed' },
        expect.objectContaining({
          type: 'unsupported',
          feature: 'toolChoice required',
        }),
      ]),
    );
  });

  it('implements toolChoice none by omitting tools', async () => {
    const fetch = createJsonFetch();
    const model = createZai({ apiKey: 'test-key', fetch })('glm-5.3');

    await model.doGenerate({
      prompt: TEST_PROMPT,
      toolChoice: { type: 'none' },
      tools: [
        {
          type: 'function',
          name: 'calculator',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
  });

  it('validates Z.AI provider options', async () => {
    const fetch = createJsonFetch();
    const model = createZai({ apiKey: 'test-key', fetch })('glm-5.3');

    await expect(
      model.doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: { zai: { requestId: 'short' } },
      }),
    ).rejects.toThrow('invalid zai provider options');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('parses text, reasoning, tool calls, cached usage, and finish reason', async () => {
    const model = createZai({
      apiKey: 'test-key',
      fetch: createJsonFetch(),
    })('glm-5.3');

    const result = await model.doGenerate({ prompt: TEST_PROMPT });

    expect(result.content).toEqual([
      { type: 'text', text: 'The answer is 42.' },
      { type: 'reasoning', text: 'I should calculate the answer.' },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'calculator',
        input: '{"value":42}',
      },
    ]);
    expect(result.finishReason).toEqual({
      unified: 'tool-calls',
      raw: 'tool_calls',
    });
    expect(result.usage.inputTokens).toMatchObject({
      total: 10,
      cacheRead: 3,
      noCache: 7,
    });
    expect(result.response).toMatchObject({
      id: 'chatcmpl-123',
      modelId: 'glm-5.3',
      timestamp: new Date(1_777_000_000 * 1000),
    });
  });

  it.each([
    ['sensitive', 'content-filter'],
    ['model_context_window_exceeded', 'length'],
    ['network_error', 'error'],
  ] as const)('maps the %s finish reason', async (raw, unified) => {
    const fetch = createJsonFetch({
      ...SUCCESS_RESPONSE,
      choices: [
        {
          ...SUCCESS_RESPONSE.choices[0],
          message: { role: 'assistant', content: null },
          finish_reason: raw,
        },
      ],
    });
    const model = createZai({ apiKey: 'test-key', fetch })('glm-5.3');

    const result = await model.doGenerate({ prompt: TEST_PROMPT });

    expect(result.finishReason).toEqual({ unified, raw });
  });

  it('streams reasoning, text, usage, raw chunks, and tool-stream options', async () => {
    const streamBody = [
      {
        id: 'chatcmpl-stream',
        created: 1_777_000_000,
        model: 'glm-5.3',
        choices: [
          {
            delta: { role: 'assistant', reasoning_content: 'Think.' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-stream',
        created: 1_777_000_000,
        model: 'glm-5.3',
        choices: [{ delta: { content: 'Answer.' }, finish_reason: null }],
      },
      {
        id: 'chatcmpl-stream',
        created: 1_777_000_000,
        model: 'glm-5.3',
        choices: [{ delta: {}, finish_reason: 'stop' }],
      },
      {
        id: 'chatcmpl-stream',
        created: 1_777_000_000,
        model: 'glm-5.3',
        choices: [],
        usage: {
          prompt_tokens: 4,
          completion_tokens: 3,
          total_tokens: 7,
        },
      },
    ]
      .map(chunk => `data: ${JSON.stringify(chunk)}\n\n`)
      .join('');

    const fetch = vi.fn().mockResolvedValue(
      new Response(`${streamBody}data: [DONE]\n\n`, {
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    const model = createZai({ apiKey: 'test-key', fetch })('glm-5.3');

    const result = await model.doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: true,
      providerOptions: { zai: { toolStream: true } },
    });
    const parts = await streamToArray(result.stream);

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ stream: true, tool_stream: true });
    expect(body).not.toHaveProperty('stream_options');
    expect(parts.map(part => part.type)).toEqual([
      'stream-start',
      'raw',
      'response-metadata',
      'reasoning-start',
      'reasoning-delta',
      'raw',
      'reasoning-end',
      'text-start',
      'text-delta',
      'raw',
      'raw',
      'text-end',
      'finish',
    ]);
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 4 },
        outputTokens: { total: 3 },
      },
    });
  });

  it('streams incremental tool-call arguments', async () => {
    const chunks = [
      {
        id: 'chatcmpl-tool',
        created: 1_777_000_000,
        model: 'glm-5.3',
        choices: [
          {
            delta: {
              role: 'assistant',
              tool_calls: [
                {
                  index: 0,
                  id: 'call-weather',
                  function: {
                    name: 'weather',
                    arguments: '{"city"',
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-tool',
        created: 1_777_000_000,
        model: 'glm-5.3',
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: ':"Paris"}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-tool',
        created: 1_777_000_000,
        model: 'glm-5.3',
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 4,
          total_tokens: 9,
        },
      },
    ]
      .map(chunk => `data: ${JSON.stringify(chunk)}\n\n`)
      .join('');
    const fetch = vi.fn().mockResolvedValue(
      new Response(`${chunks}data: [DONE]\n\n`, {
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    const model = createZai({ apiKey: 'test-key', fetch })('glm-5.3');

    const result = await model.doStream({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'function',
          name: 'weather',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      providerOptions: { zai: { toolStream: true } },
    });
    const parts = await streamToArray(result.stream);

    expect(
      parts.filter(part =>
        [
          'tool-input-start',
          'tool-input-delta',
          'tool-input-end',
          'tool-call',
        ].includes(part.type),
      ),
    ).toEqual([
      {
        type: 'tool-input-start',
        id: 'call-weather',
        toolName: 'weather',
      },
      {
        type: 'tool-input-delta',
        id: 'call-weather',
        delta: '{"city"',
      },
      {
        type: 'tool-input-delta',
        id: 'call-weather',
        delta: ':"Paris"}',
      },
      { type: 'tool-input-end', id: 'call-weather' },
      {
        type: 'tool-call',
        toolCallId: 'call-weather',
        toolName: 'weather',
        input: '{"city":"Paris"}',
      },
    ]);
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
    });
  });

  it('parses the documented Z.AI error envelope', async () => {
    const fetch = createJsonFetch(
      { code: 1001, message: 'Invalid request.' },
      400,
    );
    const model = createZai({ apiKey: 'test-key', fetch })('glm-5.3');

    const error = await model.doGenerate({ prompt: TEST_PROMPT }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(error).toMatchObject({
      name: 'AI_APICallError',
      statusCode: 400,
      message: 'Invalid request.',
    });
  });

  it('serializes and restores provider-specific model behavior', async () => {
    const model = createZai({
      apiKey: 'test-key',
      baseURL: 'https://example.com/zai',
      fetch: createJsonFetch(),
    })('glm-5.3') as ZaiChatLanguageModel;

    const serialized = ZaiChatLanguageModel[WORKFLOW_SERIALIZE](model);

    expect(serialized).toMatchObject({
      modelId: 'glm-5.3',
      config: {
        provider: 'zai.chat',
        baseURL: 'https://example.com/zai',
      },
    });
    expect(serialized.config).not.toHaveProperty('fetch');

    const fetch = createJsonFetch();
    const restored = ZaiChatLanguageModel[WORKFLOW_DESERIALIZE]({
      modelId: 'glm-5.3',
      config: { ...serialized.config, fetch } as never,
    });
    await restored.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        zai: { thinking: { type: 'enabled', clearThinking: false } },
      },
    });

    expect(String(fetch.mock.calls[0][0])).toBe(
      'https://example.com/zai/chat/completions',
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      thinking: { type: 'enabled', clear_thinking: false },
    });
  });

  it('exports constrained provider option types', () => {
    expectTypeOf<
      NonNullable<ZaiLanguageModelChatOptions['reasoningEffort']>
    >().toEqualTypeOf<
      'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    >();
    expectTypeOf<
      NonNullable<NonNullable<ZaiLanguageModelChatOptions['thinking']>['type']>
    >().toEqualTypeOf<'enabled' | 'disabled'>();
  });
});
