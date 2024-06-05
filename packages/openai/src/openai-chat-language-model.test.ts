import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  JsonTestServer,
  StreamingTestServer,
  convertStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { mapOpenAIChatLogProbsOutput } from './map-openai-chat-logprobs';
import { createOpenAI } from './openai-provider';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const TEST_LOGPROBS = {
  content: [
    {
      token: 'Hello',
      logprob: -0.0009994634,
      top_logprobs: [
        {
          token: 'Hello',
          logprob: -0.0009994634,
        },
      ],
    },
    {
      token: '!',
      logprob: -0.13410144,
      top_logprobs: [
        {
          token: '!',
          logprob: -0.13410144,
        },
      ],
    },
    {
      token: ' How',
      logprob: -0.0009250381,
      top_logprobs: [
        {
          token: ' How',
          logprob: -0.0009250381,
        },
      ],
    },
    {
      token: ' can',
      logprob: -0.047709424,
      top_logprobs: [
        {
          token: ' can',
          logprob: -0.047709424,
        },
      ],
    },
    {
      token: ' I',
      logprob: -0.000009014684,
      top_logprobs: [
        {
          token: ' I',
          logprob: -0.000009014684,
        },
      ],
    },
    {
      token: ' assist',
      logprob: -0.009125131,
      top_logprobs: [
        {
          token: ' assist',
          logprob: -0.009125131,
        },
      ],
    },
    {
      token: ' you',
      logprob: -0.0000066306106,
      top_logprobs: [
        {
          token: ' you',
          logprob: -0.0000066306106,
        },
      ],
    },
    {
      token: ' today',
      logprob: -0.00011093382,
      top_logprobs: [
        {
          token: ' today',
          logprob: -0.00011093382,
        },
      ],
    },
    {
      token: '?',
      logprob: -0.00004596782,
      top_logprobs: [
        {
          token: '?',
          logprob: -0.00004596782,
        },
      ],
    },
  ],
};

const provider = createOpenAI({
  apiKey: 'test-api-key',
  compatibility: 'strict',
});

const model = provider.chat('gpt-3.5-turbo');

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
    logprobs = null,
    finish_reason = 'stop',
  }: {
    content?: string;
    usage?: {
      prompt_tokens: number;
      total_tokens: number;
      completion_tokens: number;
    };
    logprobs?: {
      content:
        | {
            token: string;
            logprob: number;
            top_logprobs: { token: string; logprob: number }[];
          }[]
        | null;
    } | null;
    finish_reason?: string;
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
          logprobs,
          finish_reason,
        },
      ],
      usage,
      system_fingerprint: 'fp_3bc1b5746c',
    };
  }

  it('should extract text response', async () => {
    prepareJsonResponse({ content: 'Hello, World!' });

    const { text } = await model.doGenerate({
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

    const { usage } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(usage).toStrictEqual({
      promptTokens: 20,
      completionTokens: 5,
    });
  });

  it('should extract logprobs', async () => {
    prepareJsonResponse({
      logprobs: TEST_LOGPROBS,
    });

    const response = await provider
      .chat('gpt-3.5-turbo', { logprobs: 1 })
      .doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });
    expect(response.logprobs).toStrictEqual(
      mapOpenAIChatLogProbsOutput(TEST_LOGPROBS),
    );
  });

  it('should extract finish reason', async () => {
    prepareJsonResponse({
      content: '',
      finish_reason: 'stop',
    });

    const response = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(response.finishReason).toStrictEqual('stop');
  });

  it('should support unknown finish reason', async () => {
    prepareJsonResponse({
      content: '',
      finish_reason: 'eos',
    });

    const response = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(response.finishReason).toStrictEqual('unknown');
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse({ content: '' });

    server.responseHeaders = {
      'test-header': 'test-value',
    };

    const { rawResponse } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(rawResponse?.headers).toStrictEqual({
      // default headers:
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should pass the model and the messages', async () => {
    prepareJsonResponse({ content: '' });

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }],
      logprobs: false,
    });
  });

  it('should pass tools and toolChoice', async () => {
    prepareJsonResponse({ content: '' });

    await model.doGenerate({
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
        toolChoice: {
          type: 'tool',
          toolName: 'test-tool',
        },
      },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }],
      logprobs: false,
      tools: [
        {
          type: 'function',
          function: {
            name: 'test-tool',
            parameters: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        },
      ],
      tool_choice: {
        type: 'function',
        function: { name: 'test-tool' },
      },
    });
  });

  it('should pass custom headers', async () => {
    prepareJsonResponse({ content: '' });

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      organization: 'test-organization',
      project: 'test-project',
      headers: {
        'Custom-Header': 'test-header',
      },
    });

    await provider.chat('gpt-3.5-turbo').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders.get('OpenAI-Organization')).toStrictEqual(
      'test-organization',
    );
    expect(requestHeaders.get('OpenAI-Project')).toStrictEqual('test-project');
    expect(requestHeaders.get('Custom-Header')).toStrictEqual('test-header');
  });

  it('should pass the api key as Authorization header', async () => {
    prepareJsonResponse({ content: '' });

    const provider = createOpenAI({ apiKey: 'test-api-key' });

    await provider.chat('gpt-3.5-turbo').doGenerate({
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

  function prepareStreamResponse({
    content,
    usage = {
      prompt_tokens: 17,
      total_tokens: 244,
      completion_tokens: 227,
    },
    logprobs = null,
    finish_reason = 'stop',
  }: {
    content: string[];
    usage?: {
      prompt_tokens: number;
      total_tokens: number;
      completion_tokens: number;
    };
    logprobs?: {
      content:
        | {
            token: string;
            logprob: number;
            top_logprobs: { token: string; logprob: number }[];
          }[]
        | null;
    } | null;
    finish_reason?: string;
  }) {
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
        `"system_fingerprint":null,"choices":[{"index":0,"delta":{},"finish_reason":"${finish_reason}","logprobs":${JSON.stringify(
          logprobs,
        )}}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1702657020,"model":"gpt-3.5-turbo-0613",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[],"usage":${JSON.stringify(
          usage,
        )}}\n\n`,
      'data: [DONE]\n\n',
    ];
  }

  it('should stream text deltas', async () => {
    prepareStreamResponse({
      content: ['Hello', ', ', 'World!'],
      finish_reason: 'stop',
      usage: {
        prompt_tokens: 17,
        total_tokens: 244,
        completion_tokens: 227,
      },
      logprobs: TEST_LOGPROBS,
    });

    const { stream } = await model.doStream({
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
        logprobs: mapOpenAIChatLogProbsOutput(TEST_LOGPROBS),
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

    const { stream } = await model.doStream({
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
        logprobs: undefined,
        usage: { promptTokens: 53, completionTokens: 17 },
      },
    ]);
  });

  it('should stream tool call that is sent in one chunk', async () => {
    server.responseChunks = [
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
        `"tool_calls":[{"index":0,"id":"call_O17Uplv4lJvD6DVdIvFFeRMw","type":"function","function":{"name":"test-tool","arguments":"{\\"value\\":\\"Sparkle Day\\"}"}}]},` +
        `"logprobs":null,"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"tool_calls"}]}\n\n`,
      `data: {"id":"chatcmpl-96aZqmeDpA9IPD6tACY8djkMsJCMP","object":"chat.completion.chunk","created":1711357598,"model":"gpt-3.5-turbo-0125",` +
        `"system_fingerprint":"fp_3bc1b5746c","choices":[],"usage":{"prompt_tokens":53,"completion_tokens":17,"total_tokens":70}}\n\n`,
      'data: [DONE]\n\n',
    ];

    const { stream } = await model.doStream({
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
        argsTextDelta: '{"value":"Sparkle Day"}',
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
        logprobs: undefined,
        usage: { promptTokens: 53, completionTokens: 17 },
      },
    ]);
  });

  it('should handle error stream parts', async () => {
    server.responseChunks = [
      `data: {"error":{"message": "The server had an error processing your request. Sorry about that! You can retry your request, or contact us through our ` +
        `help center at help.openai.com if you keep seeing this error.","type":"server_error","param":null,"code":null}}\n\n`,
      'data: [DONE]\n\n',
    ];

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertStreamToArray(stream)).toStrictEqual([
      {
        type: 'error',
        error: {
          message:
            'The server had an error processing your request. Sorry about that! ' +
            'You can retry your request, or contact us through our help center at ' +
            'help.openai.com if you keep seeing this error.',
          type: 'server_error',
          code: null,
          param: null,
        },
      },
      {
        finishReason: 'error',
        logprobs: undefined,
        type: 'finish',
        usage: {
          completionTokens: NaN,
          promptTokens: NaN,
        },
      },
    ]);
  });

  it('should handle unparsable stream parts', async () => {
    server.responseChunks = [`data: {unparsable}\n\n`, 'data: [DONE]\n\n'];

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const elements = await convertStreamToArray(stream);

    expect(elements.length).toBe(2);
    expect(elements[0].type).toBe('error');
    expect(elements[1]).toStrictEqual({
      finishReason: 'error',
      logprobs: undefined,
      type: 'finish',
      usage: {
        completionTokens: NaN,
        promptTokens: NaN,
      },
    });
  });

  it('should expose the raw response headers', async () => {
    prepareStreamResponse({ content: [] });

    server.responseHeaders = {
      'test-header': 'test-value',
    };

    const { rawResponse } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(rawResponse?.headers).toStrictEqual({
      // default headers:
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should pass the messages and the model', async () => {
    prepareStreamResponse({ content: [] });

    await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      stream: true,
      stream_options: { include_usage: true },
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello' }],
      logprobs: false,
    });
  });

  it('should pass custom headers', async () => {
    prepareStreamResponse({ content: [] });

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      organization: 'test-organization',
      project: 'test-project',
      headers: {
        'Custom-Header': 'test-header',
      },
    });

    await provider.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders.get('OpenAI-Organization')).toStrictEqual(
      'test-organization',
    );
    expect(requestHeaders.get('OpenAI-Project')).toStrictEqual('test-project');
    expect(requestHeaders.get('Custom-Header')).toStrictEqual('test-header');
  });

  it('should pass the api key as Authorization header', async () => {
    prepareStreamResponse({ content: [] });

    const provider = createOpenAI({ apiKey: 'test-api-key' });

    await provider.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      (await server.getRequestHeaders()).get('Authorization'),
    ).toStrictEqual('Bearer test-api-key');
  });
});
