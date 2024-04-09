import { LanguageModelV1Prompt } from '../spec';
import { convertStreamToArray } from '../spec/test/convert-stream-to-array';
import { JsonTestServer } from '../spec/test/json-test-server';
import { StreamingTestServer } from '../spec/test/streaming-test-server';
import { OpenAI } from './openai-facade';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const openai = new OpenAI({
  apiKey: 'test-api-key',
});

describe('doGenerate', () => {
  const server = new JsonTestServer(
    'https://api.openai.com/v1/chat/completions',
  );

  server.setupTestEnvironment();

  function prepareJsonResponse({
    content = '',
    usage = {
      prompt_tokens: 4,
      total_tokens: 34,
      completion_tokens: 30,
    },
  }: {
    content?: string;
    usage?: {
      prompt_tokens: number;
      total_tokens: number;
      completion_tokens: number;
    };
  }) {
    server.responseBodyJson = {
      id: 'chatcmpl-95ZTZkhr0mHNKqerQfiwkuox3PHAd',
      object: 'chat.completion',
      created: 1711115037,
      model: 'gpt-3.5-turbo-0125',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          logprobs: null,
          finish_reason: 'stop',
        },
      ],
      usage,
      system_fingerprint: 'fp_3bc1b5746c',
    };
  }

  it('should extract text response', async () => {
    prepareJsonResponse({ content: 'Hello, World!' });

    const { text } = await openai.chat('gpt-3.5-turbo').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      content: '',
      usage: { prompt_tokens: 20, total_tokens: 25, completion_tokens: 5 },
    });

    const { usage } = await openai.chat('gpt-3.5-turbo').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(usage).toStrictEqual({
      promptTokens: 20,
      completionTokens: 5,
    });
  });

  it('should pass the model and the messages', async () => {
    prepareJsonResponse({ content: '' });

    await openai.chat('gpt-3.5-turbo').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    });
  });

  it('should pass the api key as Authorization header', async () => {
    prepareJsonResponse({ content: '' });

    const openai = new OpenAI({ apiKey: 'test-api-key' });

    await openai.chat('gpt-3.5-turbo').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      (await server.getRequestHeaders()).get('Authorization'),
    ).toStrictEqual('Bearer test-api-key');
  });
});

describe('doStream', () => {
  const server = new StreamingTestServer(
    'https://api.openai.com/v1/chat/completions',
  );

  server.setupTestEnvironment();

  function prepareStreamResponse({ content }: { content: string[] }) {
    server.responseChunks = [
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1702657020,"model":"gpt-3.5-turbo-0613",` +
        `"system_fingerprint":null,"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`,
      ...content.map(text => {
        return (
          `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1702657020,"model":"gpt-3.5-turbo-0613",` +
          `"system_fingerprint":null,"choices":[{"index":1,"delta":{"content":"${text}"},"finish_reason":null}]}\n\n`
        );
      }),
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1702657020,"model":"gpt-3.5-turbo-0613",` +
        `"system_fingerprint":null,"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1702657020,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[],"usage":{"prompt_tokens":17,"completion_tokens":227,"total_tokens":244}}\n\n`,
      'data: [DONE]\n\n',
    ];
  }

  it('should stream text deltas', async () => {
    prepareStreamResponse({ content: ['Hello', ', ', 'World!'] });

    const { stream } = await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    // note: space moved to last chunk bc of trimming
    expect(await convertStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: '' },
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'World!' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 17, completionTokens: 227 },
      },
    ]);
  });

  it('should stream tool deltas', async () => {
    server.responseChunks = [
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
        `"tool_calls":[{"index":0,"id":"call_O17Uplv4lJvD6DVdIvFFeRMw","type":"function","function":{"name":"test-tool","arguments":""}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\""}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"value"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\":\\""}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Spark"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"le"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" Day"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"}"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"tool_calls"}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[],"usage":{"prompt_tokens":53,"completion_tokens":17,"total_tokens":70}}\n\n`,
      'data: [DONE]\n\n',
    ];

    const { stream } = await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: {
        type: 'regular',
        tools: [
          {
            type: 'function',
            name: 'test-tool',
            parameters: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
      },
      prompt: TEST_PROMPT,
    });

    expect(await convertStreamToArray(stream)).toStrictEqual([
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '{"',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: 'value',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '":"',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: 'Spark',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: 'le',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: ' Day',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'call_O17Uplv4lJvD6DVdIvFFeRMw',
        toolCallType: 'function',
        toolName: 'test-tool',
        args: '{"value":"Sparkle Day"}',
      },
      {
        type: 'finish',
        finishReason: 'tool-calls',
        usage: { promptTokens: 53, completionTokens: 17 },
      },
    ]);
  });

  it('should pass the messages and the model', async () => {
    prepareStreamResponse({ content: [] });

    await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      stream: true,
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    });
  });

  it('should scale the temperature', async () => {
    prepareStreamResponse({ content: [] });

    await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      temperature: 0.5,
    });

    expect((await server.getRequestBodyJson()).temperature).toBeCloseTo(1, 5);
  });

  it('should scale the frequency penalty', async () => {
    prepareStreamResponse({ content: [] });

    await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      frequencyPenalty: 0.2,
    });

    expect((await server.getRequestBodyJson()).frequency_penalty).toBeCloseTo(
      0.4,
      5,
    );
  });

  it('should scale the presence penalty', async () => {
    prepareStreamResponse({ content: [] });

    await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      presencePenalty: -0.9,
    });

    expect((await server.getRequestBodyJson()).presence_penalty).toBeCloseTo(
      -1.8,
      5,
    );
  });

  it('should pass the organization as OpenAI-Organization header', async () => {
    prepareStreamResponse({ content: [] });

    const openai = new OpenAI({
      apiKey: 'test-api-key',
      organization: 'test-organization',
    });

    await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      (await server.getRequestHeaders()).get('OpenAI-Organization'),
    ).toStrictEqual('test-organization');
  });

  it('should pass the api key as Authorization header', async () => {
    prepareStreamResponse({ content: [] });

    const openai = new OpenAI({ apiKey: 'test-api-key' });

    await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      (await server.getRequestHeaders()).get('Authorization'),
    ).toStrictEqual('Bearer test-api-key');
  });
});
