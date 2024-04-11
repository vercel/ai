import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  JsonTestServer,
  StreamingTestServer,
  convertStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { Mistral } from './mistral-facade';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const mistral = new Mistral({ apiKey: 'test-api-key' });

describe('doGenerate', () => {
  const server = new JsonTestServer(
    'https://api.mistral.ai/v1/chat/completions',
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
      id: '16362f24e60340d0994dd205c267a43a',
      object: 'chat.completion',
      created: 1711113008,
      model: 'mistral-small-latest',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
            tool_calls: null,
          },
          finish_reason: 'stop',
          logprobs: null,
        },
      ],
      usage,
    };
  }

  it('should extract text response', async () => {
    prepareJsonResponse({ content: 'Hello, World!' });

    const { text } = await mistral.chat('mistral-small-latest').doGenerate({
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

    const { usage } = await mistral.chat('mistral-small-latest').doGenerate({
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

    await mistral.chat('mistral-small-latest').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('should pass the api key as Authorization header', async () => {
    prepareJsonResponse({ content: '' });

    const mistral = new Mistral({ apiKey: 'test-api-key' });

    await mistral.chat('mistral-small-latest').doGenerate({
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
    'https://api.mistral.ai/v1/chat/completions',
  );

  server.setupTestEnvironment();

  function prepareStreamResponse({ content }: { content: string[] }) {
    server.responseChunks = [
      `data:  {"id":"6e2cd91750904b7092f49bdca9083de1","object":"chat.completion.chunk",` +
        `"created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,` +
        `"delta":{"role":"assistant","content":""},"finish_reason":null,"logprobs":null}]}\n\n`,
      ...content.map(text => {
        return (
          `data:  {"id":"6e2cd91750904b7092f49bdca9083de1","object":"chat.completion.chunk",` +
          `"created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,` +
          `"delta":{"role":"assistant","content":"${text}"},"finish_reason":null,"logprobs":null}]}\n\n`
        );
      }),
      `data:  {"id":"6e2cd91750904b7092f49bdca9083de1","object":"chat.completion.chunk",` +
        `"created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,` +
        `"delta":{"content":""},"finish_reason":"stop","logprobs":null}],` +
        `"usage":{"prompt_tokens":4,"total_tokens":36,"completion_tokens":32}}\n\n`,
      `data: [DONE]\n\n`,
    ];
  }

  it('should stream text deltas', async () => {
    prepareStreamResponse({ content: ['Hello', ', ', 'world!'] });

    const { stream } = await mistral.chat('mistral-small-latest').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: '' },
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'world!' },
      { type: 'text-delta', textDelta: '' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 4, completionTokens: 32 },
      },
    ]);
  });

  it('should stream tool deltas', async () => {
    server.responseChunks = [
      `data: {"id":"ad6f7ce6543c4d0890280ae184fe4dd8","object":"chat.completion.chunk","created":1711365023,"model":"mistral-large-latest",` +
        `"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null,"logprobs":null}]}\n\n`,
      `data: {"id":"ad6f7ce6543c4d0890280ae184fe4dd8","object":"chat.completion.chunk","created":1711365023,"model":"mistral-large-latest",` +
        `"choices":[{"index":0,"delta":{"content":null,"tool_calls":[{"function":{"name":"test-tool","arguments":` +
        `"{\\"value\\":\\"Sparkle Day\\"}"` +
        `}}]},"finish_reason":"tool_calls","logprobs":null}],"usage":{"prompt_tokens":183,"total_tokens":316,"completion_tokens":133}}\n\n`,
      'data: [DONE]\n\n',
    ];

    const { stream } = await new Mistral({
      apiKey: 'test-api-key',
      generateId: () => 'test-id',
    })
      .chat('mistral-large-latest')
      .doStream({
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
        type: 'text-delta',
        textDelta: '',
      },
      {
        type: 'tool-call-delta',
        toolCallId: 'test-id',
        toolCallType: 'function',
        toolName: 'test-tool',
        argsTextDelta: '{"value":"Sparkle Day"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'test-id',
        toolCallType: 'function',
        toolName: 'test-tool',
        args: '{"value":"Sparkle Day"}',
      },
      {
        type: 'finish',
        finishReason: 'tool-calls',
        usage: { promptTokens: 183, completionTokens: 133 },
      },
    ]);
  });

  it('should pass the messages', async () => {
    prepareStreamResponse({ content: [''] });

    await mistral.chat('mistral-small-latest').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      stream: true,
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('should pass the api key as Authorization header', async () => {
    prepareStreamResponse({ content: [''] });

    const mistral = new Mistral({ apiKey: 'test-api-key' });

    await mistral.chat('mistral-small-latest').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      (await server.getRequestHeaders()).get('Authorization'),
    ).toStrictEqual('Bearer test-api-key');
  });
});
