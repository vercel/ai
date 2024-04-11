import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  JsonTestServer,
  StreamingTestServer,
  convertStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { OpenAI } from './openai-facade';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const openai = new OpenAI({
  apiKey: 'test-api-key',
});

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
  }: {
    content?: string;
    usage?: {
      prompt_tokens: number;
      total_tokens: number;
      completion_tokens: number;
    };
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
          logprobs: null,
          finish_reason: 'stop',
        },
      ],
      usage,
    };
  }

  it('should extract text response', async () => {
    prepareJsonResponse({ content: 'Hello, World!' });

    const { text } = await openai
      .completion('gpt-3.5-turbo-instruct')
      .doGenerate({
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

    const { usage } = await openai
      .completion('gpt-3.5-turbo-instruct')
      .doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

    expect(usage).toStrictEqual({
      promptTokens: 20,
      completionTokens: 5,
    });
  });

  it('should pass the model and the prompt', async () => {
    prepareJsonResponse({ content: '' });

    await openai.completion('gpt-3.5-turbo-instruct').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'gpt-3.5-turbo-instruct',
      prompt: 'Hello',
    });
  });

  it('should pass the api key as Authorization header', async () => {
    prepareJsonResponse({ content: '' });

    const openai = new OpenAI({ apiKey: 'test-api-key' });

    await openai.completion('gpt-3.5-turbo-instruct').doGenerate({
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

  function prepareStreamResponse({ content }: { content: string[] }) {
    server.responseChunks = [
      ...content.map(text => {
        return (
          `data: {"id":"cmpl-96c64EdfhOw8pjFFgVpLuT8k2MtdT","object":"text_completion","created":1711363440,` +
          `"choices":[{"text":"${text}","index":0,"logprobs":null,"finish_reason":null}],"model":"gpt-3.5-turbo-instruct"}\n\n`
        );
      }),
      `data: {"id":"cmpl-96c3yLQE1TtZCd6n6OILVmzev8M8H","object":"text_completion","created":1711363310,` +
        `"choices":[{"text":"","index":0,"logprobs":null,"finish_reason":"stop"}],"model":"gpt-3.5-turbo-instruct"}\n\n`,
      `data: {"id":"cmpl-96c3yLQE1TtZCd6n6OILVmzev8M8H","object":"text_completion","created":1711363310,` +
        `"model":"gpt-3.5-turbo-instruct","usage":{"prompt_tokens":10,"completion_tokens":362,"total_tokens":372},"choices":[]}\n\n`,
      'data: [DONE]\n\n',
    ];
  }

  it('should stream text deltas', async () => {
    prepareStreamResponse({ content: ['Hello', ', ', 'World!'] });

    const { stream } = await openai
      .completion('gpt-3.5-turbo-instruct')
      .doStream({
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
        usage: { promptTokens: 10, completionTokens: 362 },
      },
    ]);
  });

  it('should pass the model and the prompt', async () => {
    prepareStreamResponse({ content: [] });

    await openai.completion('gpt-3.5-turbo-instruct').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      stream: true,
      model: 'gpt-3.5-turbo-instruct',
      prompt: 'Hello',
    });
  });

  it('should scale the temperature', async () => {
    prepareStreamResponse({ content: [] });

    await openai.completion('gpt-3.5-turbo-instruct').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      temperature: 0.5,
    });

    expect((await server.getRequestBodyJson()).temperature).toBeCloseTo(1, 5);
  });

  it('should scale the frequency penalty', async () => {
    prepareStreamResponse({ content: [] });

    await openai.completion('gpt-3.5-turbo-instruct').doStream({
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

    await openai.completion('gpt-3.5-turbo-instruct').doStream({
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

    await openai.completion('gpt-3.5-turbo-instruct').doStream({
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

    await openai.completion('gpt-3.5-turbo-instruct').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      (await server.getRequestHeaders()).get('Authorization'),
    ).toStrictEqual('Bearer test-api-key');
  });
});
