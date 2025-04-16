import { LanguageModelV2Prompt } from '@ai-sdk/provider';
import {
  convertReadableStreamToArray,
  createTestServer,
} from '@ai-sdk/provider-utils/test';
import { mapOpenAICompletionLogProbs } from './map-openai-completion-logprobs';
import { createOpenAI } from './openai-provider';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const TEST_LOGPROBS = {
  tokens: [' ever', ' after', '.\n\n', 'The', ' end', '.'],
  token_logprobs: [
    -0.0664508, -0.014520033, -1.3820221, -0.7890417, -0.5323165, -0.10247037,
  ],
  top_logprobs: [
    {
      ' ever': -0.0664508,
    },
    {
      ' after': -0.014520033,
    },
    {
      '.\n\n': -1.3820221,
    },
    {
      The: -0.7890417,
    },
    {
      ' end': -0.5323165,
    },
    {
      '.': -0.10247037,
    },
  ] as Record<string, number>[],
};

const provider = createOpenAI({
  apiKey: 'test-api-key',
  compatibility: 'strict',
});

const model = provider.completion('gpt-3.5-turbo-instruct');

const server = createTestServer({
  'https://api.openai.com/v1/completions': {},
});

describe('doGenerate', () => {
  function prepareJsonResponse({
    content = '',
    usage = {
      prompt_tokens: 4,
      total_tokens: 34,
      completion_tokens: 30,
    },
    logprobs = null,
    finish_reason = 'stop',
    id = 'cmpl-96cAM1v77r4jXa4qb2NSmRREV5oWB',
    created = 1711363706,
    model = 'gpt-3.5-turbo-instruct',
    headers,
  }: {
    content?: string;
    usage?: {
      prompt_tokens: number;
      total_tokens: number;
      completion_tokens: number;
    };
    logprobs?: {
      tokens: string[];
      token_logprobs: number[];
      top_logprobs: Record<string, number>[];
    } | null;
    finish_reason?: string;
    id?: string;
    created?: number;
    model?: string;
    headers?: Record<string, string>;
  }) {
    server.urls['https://api.openai.com/v1/completions'].response = {
      type: 'json-value',
      headers,
      body: {
        id,
        object: 'text_completion',
        created,
        model,
        choices: [
          {
            text: content,
            index: 0,
            logprobs,
            finish_reason,
          },
        ],
        usage,
      },
    };
  }

  it('should extract text response', async () => {
    prepareJsonResponse({ content: 'Hello, World!' });

    const { content } = await model.doGenerate({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
    });

    expect(content).toMatchInlineSnapshot(`
      [
        {
          "text": "Hello, World!",
          "type": "text",
        },
      ]
    `);
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      content: '',
      usage: { prompt_tokens: 20, total_tokens: 25, completion_tokens: 5 },
    });

    const { usage } = await model.doGenerate({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
    });

    expect(usage).toStrictEqual({ inputTokens: 20, outputTokens: 5 });
  });

  it('should send request body', async () => {
    prepareJsonResponse({});

    const { request } = await model.doGenerate({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
    });

    expect(request).toMatchInlineSnapshot(`
      {
        "body": {
          "echo": undefined,
          "frequency_penalty": undefined,
          "logit_bias": undefined,
          "logprobs": undefined,
          "max_tokens": undefined,
          "model": "gpt-3.5-turbo-instruct",
          "presence_penalty": undefined,
          "prompt": "Hello",
          "seed": undefined,
          "stop": undefined,
          "suffix": undefined,
          "temperature": undefined,
          "top_p": undefined,
          "user": undefined,
        },
      }
    `);
  });

  it('should send additional response information', async () => {
    prepareJsonResponse({
      id: 'test-id',
      created: 123,
      model: 'test-model',
    });

    const { response } = await model.doGenerate({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
    });

    expect({
      id: response?.id,
      timestamp: response?.timestamp,
      modelId: response?.modelId,
    }).toStrictEqual({
      id: 'test-id',
      timestamp: new Date(123 * 1000),
      modelId: 'test-model',
    });
  });

  it('should extract logprobs', async () => {
    prepareJsonResponse({ logprobs: TEST_LOGPROBS });

    const provider = createOpenAI({ apiKey: 'test-api-key' });

    const response = await provider
      .completion('gpt-3.5-turbo', { logprobs: 1 })
      .doGenerate({
        inputFormat: 'prompt',
        prompt: TEST_PROMPT,
      });
    expect(response.logprobs).toStrictEqual(
      mapOpenAICompletionLogProbs(TEST_LOGPROBS),
    );
  });

  it('should extract finish reason', async () => {
    prepareJsonResponse({
      content: '',
      finish_reason: 'stop',
    });

    const { finishReason } = await provider
      .completion('gpt-3.5-turbo-instruct')
      .doGenerate({
        inputFormat: 'prompt',
        prompt: TEST_PROMPT,
      });

    expect(finishReason).toStrictEqual('stop');
  });

  it('should support unknown finish reason', async () => {
    prepareJsonResponse({
      content: '',
      finish_reason: 'eos',
    });

    const { finishReason } = await provider
      .completion('gpt-3.5-turbo-instruct')
      .doGenerate({
        inputFormat: 'prompt',
        prompt: TEST_PROMPT,
      });

    expect(finishReason).toStrictEqual('unknown');
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse({
      headers: {
        'test-header': 'test-value',
      },
    });

    const { response } = await model.doGenerate({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
    });

    expect(response?.headers).toStrictEqual({
      // default headers:
      'content-length': '266',
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should pass the model and the prompt', async () => {
    prepareJsonResponse({ content: '' });

    await model.doGenerate({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      model: 'gpt-3.5-turbo-instruct',
      prompt: 'Hello',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse({ content: '' });

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      organization: 'test-organization',
      project: 'test-project',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.completion('gpt-3.5-turbo-instruct').doGenerate({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      'openai-organization': 'test-organization',
      'openai-project': 'test-project',
    });
  });
});

describe('doStream', () => {
  function prepareStreamResponse({
    content = [],
    finish_reason = 'stop',
    usage = {
      prompt_tokens: 10,
      total_tokens: 372,
      completion_tokens: 362,
    },
    logprobs = null,
    headers,
  }: {
    content?: string[];
    usage?: {
      prompt_tokens: number;
      total_tokens: number;
      completion_tokens: number;
    };
    logprobs?: {
      tokens: string[];
      token_logprobs: number[];
      top_logprobs: Record<string, number>[];
    } | null;
    finish_reason?: string;
    headers?: Record<string, string>;
  }) {
    server.urls['https://api.openai.com/v1/completions'].response = {
      type: 'stream-chunks',
      headers,
      chunks: [
        ...content.map(text => {
          return (
            `data: {"id":"cmpl-96c64EdfhOw8pjFFgVpLuT8k2MtdT","object":"text_completion","created":1711363440,` +
            `"choices":[{"text":"${text}","index":0,"logprobs":null,"finish_reason":null}],"model":"gpt-3.5-turbo-instruct"}\n\n`
          );
        }),
        `data: {"id":"cmpl-96c3yLQE1TtZCd6n6OILVmzev8M8H","object":"text_completion","created":1711363310,` +
          `"choices":[{"text":"","index":0,"logprobs":${JSON.stringify(
            logprobs,
          )},"finish_reason":"${finish_reason}"}],"model":"gpt-3.5-turbo-instruct"}\n\n`,
        `data: {"id":"cmpl-96c3yLQE1TtZCd6n6OILVmzev8M8H","object":"text_completion","created":1711363310,` +
          `"model":"gpt-3.5-turbo-instruct","usage":${JSON.stringify(
            usage,
          )},"choices":[]}\n\n`,
        'data: [DONE]\n\n',
      ],
    };
  }

  it('should stream text deltas', async () => {
    prepareStreamResponse({
      content: ['Hello', ', ', 'World!'],
      finish_reason: 'stop',
      usage: {
        prompt_tokens: 10,
        total_tokens: 372,
        completion_tokens: 362,
      },
      logprobs: TEST_LOGPROBS,
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchInlineSnapshot(`
      [
        {
          "id": "cmpl-96c64EdfhOw8pjFFgVpLuT8k2MtdT",
          "modelId": "gpt-3.5-turbo-instruct",
          "timestamp": 2024-03-25T10:44:00.000Z,
          "type": "response-metadata",
        },
        {
          "text": "Hello",
          "type": "text",
        },
        {
          "text": ", ",
          "type": "text",
        },
        {
          "text": "World!",
          "type": "text",
        },
        {
          "text": "",
          "type": "text",
        },
        {
          "finishReason": "stop",
          "logprobs": [
            {
              "logprob": -0.0664508,
              "token": " ever",
              "topLogprobs": [
                {
                  "logprob": -0.0664508,
                  "token": " ever",
                },
              ],
            },
            {
              "logprob": -0.014520033,
              "token": " after",
              "topLogprobs": [
                {
                  "logprob": -0.014520033,
                  "token": " after",
                },
              ],
            },
            {
              "logprob": -1.3820221,
              "token": ".

      ",
              "topLogprobs": [
                {
                  "logprob": -1.3820221,
                  "token": ".

      ",
                },
              ],
            },
            {
              "logprob": -0.7890417,
              "token": "The",
              "topLogprobs": [
                {
                  "logprob": -0.7890417,
                  "token": "The",
                },
              ],
            },
            {
              "logprob": -0.5323165,
              "token": " end",
              "topLogprobs": [
                {
                  "logprob": -0.5323165,
                  "token": " end",
                },
              ],
            },
            {
              "logprob": -0.10247037,
              "token": ".",
              "topLogprobs": [
                {
                  "logprob": -0.10247037,
                  "token": ".",
                },
              ],
            },
          ],
          "type": "finish",
          "usage": {
            "inputTokens": 10,
            "outputTokens": 362,
          },
        },
      ]
    `);
  });

  it('should handle error stream parts', async () => {
    server.urls['https://api.openai.com/v1/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: {"error":{"message": "The server had an error processing your request. Sorry about that! You can retry your request, or contact us through our ` +
          `help center at help.openai.com if you keep seeing this error.","type":"server_error","param":null,"code":null}}\n\n`,
        'data: [DONE]\n\n',
      ],
    };

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
    });

    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
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
        usage: { inputTokens: undefined, outputTokens: undefined },
      },
    ]);
  });

  it('should handle unparsable stream parts', async () => {
    server.urls['https://api.openai.com/v1/completions'].response = {
      type: 'stream-chunks',
      chunks: [`data: {unparsable}\n\n`, 'data: [DONE]\n\n'],
    };

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
    });

    const elements = await convertReadableStreamToArray(stream);

    expect(elements.length).toBe(2);
    expect(elements[0].type).toBe('error');
    expect(elements[1]).toStrictEqual({
      finishReason: 'error',
      logprobs: undefined,
      type: 'finish',
      usage: { inputTokens: undefined, outputTokens: undefined },
    });
  });

  it('should send request body', async () => {
    prepareStreamResponse({ content: [] });

    const { request } = await model.doStream({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
    });

    expect(request).toStrictEqual({
      body: '{"model":"gpt-3.5-turbo-instruct","prompt":"Hello","stream":true,"stream_options":{"include_usage":true}}',
    });
  });

  it('should expose the raw response headers', async () => {
    prepareStreamResponse({
      headers: { 'test-header': 'test-value' },
    });

    const { response } = await model.doStream({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
    });

    expect(response?.headers).toStrictEqual({
      // default headers:
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',

      // custom header
      'test-header': 'test-value',
    });
  });

  it('should pass the model and the prompt', async () => {
    prepareStreamResponse({ content: [] });

    await model.doStream({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBody).toStrictEqual({
      stream: true,
      stream_options: { include_usage: true },
      model: 'gpt-3.5-turbo-instruct',
      prompt: 'Hello',
    });
  });

  it('should pass headers', async () => {
    prepareStreamResponse({ content: [] });

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      organization: 'test-organization',
      project: 'test-project',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.completion('gpt-3.5-turbo-instruct').doStream({
      inputFormat: 'prompt',
      prompt: TEST_PROMPT,
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      'openai-organization': 'test-organization',
      'openai-project': 'test-project',
    });
  });
});
