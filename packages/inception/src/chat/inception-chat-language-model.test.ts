import type { JSONSchema7, LanguageModelV4CallOptions } from '@ai-sdk/provider';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createInception } from '../inception-provider';
import { InceptionChatLanguageModel } from './inception-chat-language-model';

const url = 'https://api.inceptionlabs.ai/v1/chat/completions';
const customUrl = 'https://example.com/v1/chat/completions';
const server = createTestServer({ [url]: {}, [customUrl]: {} });
const model = createInception({ apiKey: 'test-key' })('mercury-3');
const prompt: LanguageModelV4CallOptions['prompt'] = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];
const usage = {
  prompt_tokens: 20,
  completion_tokens: 10,
  total_tokens: 30,
  prompt_tokens_details: { cached_tokens: 5 },
  completion_tokens_details: { reasoning_tokens: 3 },
};
const response = {
  id: 'chatcmpl-test',
  created: 1745798400,
  model: 'mercury-3',
  choices: [
    {
      message: { role: 'assistant', content: 'Hello!' },
      finish_reason: 'stop',
    },
  ],
  usage,
};

describe('Inception chat', () => {
  beforeEach(() => {
    server.urls[url].response = { type: 'json-value', body: response };
  });

  it('maps chat settings, reasoning effort and response metadata', async () => {
    const result = await model.doGenerate({
      prompt,
      maxOutputTokens: 100,
      temperature: 0.75,
      stopSequences: ['END'],
      providerOptions: {
        inception: { reasoningEffort: 'instant', realtime: true },
      },
    });

    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'mercury-3',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ],
      max_completion_tokens: 100,
      temperature: 0.75,
      stop: ['END'],
      reasoning_effort: 'instant',
      realtime: true,
    });
    expect(result.content).toEqual([{ type: 'text', text: 'Hello!' }]);
    expect(result.finishReason).toEqual({ unified: 'stop', raw: 'stop' });
    expect(result.response).toMatchObject({
      id: 'chatcmpl-test',
      modelId: 'mercury-3',
      timestamp: new Date(1745798400000),
    });
    expect(result.usage).toMatchObject({
      inputTokens: { total: 20, noCache: 15, cacheRead: 5 },
      outputTokens: { total: 10, text: 7, reasoning: 3 },
      raw: usage,
    });
  });

  it('supports the flat usage fields shown in the API reference', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: {
        ...response,
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          reasoning_tokens: 3,
          cached_input_tokens: 5,
        },
      },
    };
    const result = await model.doGenerate({ prompt });
    expect(result.usage.inputTokens).toMatchObject({
      total: 20,
      noCache: 15,
      cacheRead: 5,
    });
    expect(result.usage.outputTokens).toMatchObject({
      total: 10,
      text: 7,
      reasoning: 3,
    });
  });

  it('sends JSON schemas and honors strictJsonSchema', async () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    };
    await model.doGenerate({
      prompt,
      responseFormat: {
        type: 'json',
        schema,
        name: 'person',
        description: 'A person',
      },
      providerOptions: { inception: { strictJsonSchema: false } },
    });
    expect((await server.calls[0].requestBodyJson).response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'person',
        description: 'A person',
        schema,
        strict: false,
      },
    });
  });

  it('uses JSON object mode when no schema is provided', async () => {
    await model.doGenerate({ prompt, responseFormat: { type: 'json' } });
    expect((await server.calls[0].requestBodyJson).response_format).toEqual({
      type: 'json_object',
    });
  });

  it('round-trips tool calls and tool results', async () => {
    server.urls[url].response = {
      type: 'json-value',
      body: {
        ...response,
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'weather', arguments: '{"city":"Paris"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      },
    };
    const result = await model.doGenerate({
      prompt: [
        ...prompt,
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'previous-call',
              toolName: 'weather',
              input: { city: 'London' },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'previous-call',
              toolName: 'weather',
              output: { type: 'json', value: { temperature: 20 } },
            },
          ],
        },
      ],
      tools: [
        {
          type: 'function',
          name: 'weather',
          description: 'Get weather',
          inputSchema: {
            type: 'object',
            properties: { city: { type: 'string' } },
          },
          strict: true,
        },
      ],
      toolChoice: { type: 'tool', toolName: 'weather' },
    });
    const body = await server.calls[0].requestBodyJson;
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'weather',
          description: 'Get weather',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string' } },
          },
          strict: true,
        },
      },
    ]);
    expect(body.tool_choice).toEqual({
      type: 'function',
      function: { name: 'weather' },
    });
    expect(body.messages.slice(-2)).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'previous-call',
            type: 'function',
            function: { name: 'weather', arguments: '{"city":"London"}' },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'previous-call',
        content: '{"temperature":20}',
      },
    ]);
    expect(result.content).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: '{"city":"Paris"}',
      },
    ]);
    expect(result.finishReason).toEqual({
      unified: 'tool-calls',
      raw: 'tool_calls',
    });
  });

  it('streams text, parallel tool calls, and final usage', async () => {
    const chunks = [
      {
        choices: [
          {
            delta: { role: 'assistant', content: 'Checking ' },
            finish_reason: null,
          },
        ],
      },
      { choices: [{ delta: { content: 'weather.' }, finish_reason: null }] },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'weather', arguments: '{"city":' },
                },
                {
                  index: 1,
                  id: 'call-2',
                  type: 'function',
                  function: { name: 'weather', arguments: '{"city":' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 1, function: { arguments: '"London"}' } },
                { index: 0, function: { arguments: '"Paris"}' } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      },
      { choices: [], usage },
    ];
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: [
        ...chunks.map(
          chunk =>
            `data: ${JSON.stringify({ id: 'chatcmpl-test', created: 1745798400, model: 'mercury-3', ...chunk })}\n\n`,
        ),
        'data: [DONE]\n\n',
      ],
    };
    const result = await model.doStream({ prompt, includeRawChunks: true });
    const parts = await convertReadableStreamToArray(result.stream);
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(
      parts
        .filter(part => part.type === 'text-delta')
        .map(part => part.delta)
        .join(''),
    ).toBe('Checking weather.');
    expect(parts.filter(part => part.type === 'tool-call')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolCallId: 'call-1',
          toolName: 'weather',
          input: '{"city":"Paris"}',
        }),
        expect.objectContaining({
          toolCallId: 'call-2',
          toolName: 'weather',
          input: '{"city":"London"}',
        }),
      ]),
    );
    expect(parts.filter(part => part.type === 'raw')).toHaveLength(
      chunks.length,
    );
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'tool-calls' },
      usage: {
        inputTokens: { cacheRead: 5 },
        outputTokens: { reasoning: 3, text: 7 },
      },
    });
  });

  it.each([
    ['none', 'instant'],
    ['minimal', 'instant'],
    ['low', 'low'],
    ['medium', 'medium'],
    ['high', 'high'],
    ['max', 'high'],
  ] as const)('maps reasoning %s to %s', async (reasoning, effort) => {
    await model.doGenerate({ prompt, reasoning });
    expect((await server.calls[0].requestBodyJson).reasoning_effort).toBe(
      effort,
    );
  });

  it('gives provider reasoning effort precedence over top-level reasoning', async () => {
    await model.doGenerate({
      prompt,
      reasoning: 'high',
      providerOptions: { inception: { reasoningEffort: 'instant' } },
    });
    expect((await server.calls[0].requestBodyJson).reasoning_effort).toBe(
      'instant',
    );
  });

  it('omits unsupported sampling settings with warnings', async () => {
    const result = await model.doGenerate({
      prompt,
      topP: 0.5,
      topK: 2,
      frequencyPenalty: 1,
      presencePenalty: 1,
      seed: 5,
    });
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'mercury-3',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ],
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining(
        ['topP', 'topK', 'frequencyPenalty', 'presencePenalty', 'seed'].map(
          feature => ({ type: 'unsupported', feature }),
        ),
      ),
    );
  });

  it('rejects invalid Inception options before sending a request', async () => {
    await expect(
      model.doGenerate({
        prompt,
        providerOptions: { inception: { reasoningEffort: 'extreme' } },
      }),
    ).rejects.toThrow('invalid inception provider options');
    expect(server.calls).toHaveLength(0);
  });

  it('reports API errors', async () => {
    server.urls[url].response = {
      type: 'error',
      status: 401,
      body: JSON.stringify({
        error: {
          message: 'Incorrect API key provided',
          type: 'authentication_error',
          code: 'invalid_api_key',
          param: null,
        },
      }),
    };
    await expect(model.doGenerate({ prompt })).rejects.toMatchObject({
      statusCode: 401,
      message: 'Incorrect API key provided',
      isRetryable: false,
    });
  });

  it('restores the URL and request mappings after workflow serialization', async () => {
    server.urls[customUrl].response = { type: 'json-value', body: response };
    const original = createInception({
      apiKey: 'test-key',
      baseURL: 'https://example.com/v1',
    })('mercury-3') as InceptionChatLanguageModel;
    const serialized = InceptionChatLanguageModel[WORKFLOW_SERIALIZE](original);
    expect(serialized.config.baseURL).toBe('https://example.com/v1');
    const restored = InceptionChatLanguageModel[WORKFLOW_DESERIALIZE]({
      ...serialized,
      config: { ...serialized.config, provider: original.provider },
    });
    await restored.doGenerate({
      prompt,
      maxOutputTokens: 200,
      reasoning: 'minimal',
    });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      max_completion_tokens: 200,
      reasoning_effort: 'instant',
    });
  });
});
