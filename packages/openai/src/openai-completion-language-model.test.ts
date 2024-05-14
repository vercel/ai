import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  JsonTestServer,
  StreamingTestServer,
  convertStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createOpenAI } from './openai-provider';
import { mapOpenAICompletionLogProbs } from './map-openai-completion-logprobs';

const TEST_PROMPT: LanguageModelV1Prompt = [
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

const provider = createOpenAI({ apiKey: 'test-api-key' });
const model = provider.completion('gpt-3.5-turbo-instruct');

describe('doGenerate', () => {
  const server = new JsonTestServer('https://api.openai.com/v1/completions');

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
      tokens: string[];
      token_logprobs: number[];
      top_logprobs: Record<string, number>[];
    } | null;
    finish_reason?: string;
  }) {
    server.responseBodyJson = {
      id: 'cmpl-96cAM1v77r4jXa4qb2NSmRREV5oWB',
      object: 'text_completion',
      created: 1711363706,
      model: 'gpt-3.5-turbo-instruct',
      choices: [
        {
          text: content,
          index: 0,
          logprobs,
          finish_reason,
        },
      ],
      usage,
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
    prepareJsonResponse({ logprobs: TEST_LOGPROBS });

    const provider = createOpenAI({ apiKey: 'test-api-key' });

    const response = await provider
      .completion('gpt-3.5-turbo', { logprobs: 1 })
      .doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });
    expect(response.logprobs).toStrictEqual(
      mapOpenAICompletionLogProbs(TEST_LOGPROBS),
    );
  });

  it('should finish reason', async () => {
    prepareJsonResponse({
      content: '',
      finish_reason: 'stop',
    });

    const { finishReason } = await provider
      .completion('gpt-3.5-turbo-instruct')
      .doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

    expect(finishReason).toStrictEqual('stop');
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

  it('should pass the model and the prompt', async () => {
    prepareJsonResponse({ content: '' });

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'gpt-3.5-turbo-instruct',
      prompt: 'Hello',
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

    await provider.completion('gpt-3.5-turbo-instruct').doGenerate({
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

    await provider.completion('gpt-3.5-turbo-instruct').doGenerate({
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
    'https://api.openai.com/v1/completions',
  );

  server.setupTestEnvironment();

  function prepareStreamResponse({
    content,
    finish_reason = 'stop',
    usage = {
      prompt_tokens: 10,
      total_tokens: 372,
      completion_tokens: 362,
    },
    logprobs = null,
  }: {
    content: string[];
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
  }) {
    server.responseChunks = [
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
    ];
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
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    // note: space moved to last chunk bc of trimming
    expect(await convertStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'World!' },
      { type: 'text-delta', textDelta: '' },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: mapOpenAICompletionLogProbs(TEST_LOGPROBS),
        usage: { promptTokens: 10, completionTokens: 362 },
      },
    ]);
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

  it('should pass the model and the prompt', async () => {
    prepareStreamResponse({ content: [] });

    await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      stream: true,
      stream_options: { include_usage: true },
      model: 'gpt-3.5-turbo-instruct',
      prompt: 'Hello',
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

    await provider.completion('gpt-3.5-turbo-instruct').doStream({
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

    await provider.completion('gpt-3.5-turbo-instruct').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      (await server.getRequestHeaders()).get('Authorization'),
    ).toStrictEqual('Bearer test-api-key');
  });
});
