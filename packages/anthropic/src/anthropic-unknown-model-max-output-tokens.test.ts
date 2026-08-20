import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAnthropic } from './anthropic-provider';

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

describe('unknown model max output tokens', () => {
  const server = createTestServer({
    'https://api.anthropic.com/v1/messages': {},
  });

  const model = createAnthropic({ apiKey: 'test-api-key' })('future-model');
  const futureClaudeModel = createAnthropic({ apiKey: 'test-api-key' })(
    'claude-future-9',
  );
  const platformFutureClaudeModel = createAnthropic({
    apiKey: 'test-api-key',
  })('us.anthropic.claude-future-9-20990101-v1:0');
  const legacyClaudeModel = createAnthropic({ apiKey: 'test-api-key' })(
    'claude-3-5-sonnet-20241022',
  );

  beforeEach(() => {
    server.urls['https://api.anthropic.com/v1/messages'].response = {
      type: 'json-value',
      body: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'future-model',
        content: [{ type: 'text', text: 'Hello!' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    };
  });

  it('should warn when using the default max output token limit', async () => {
    const { warnings } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'future-model',
      max_tokens: 4096,
    });
    expect(warnings).toEqual([
      {
        type: 'compatibility',
        feature: 'maxOutputTokens',
        details:
          'The model "future-model" is unknown. The max output tokens have been limited to 4096. Set maxOutputTokens explicitly to override this limit.',
      },
    ]);
  });

  it('should not warn when max output tokens are provided', async () => {
    const { warnings } = await model.doGenerate({
      prompt: TEST_PROMPT,
      maxOutputTokens: 123456,
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'future-model',
      max_tokens: 123456,
    });
    expect(warnings).toEqual([]);
  });

  it('should use the current-generation default and warn for an unknown Claude model', async () => {
    const { warnings } = await futureClaudeModel.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'claude-future-9',
      max_tokens: 128000,
    });
    expect(warnings).toEqual([
      {
        type: 'compatibility',
        feature: 'maxOutputTokens',
        details:
          'The model "claude-future-9" is unknown. The max output tokens have been limited to 128000. Set maxOutputTokens explicitly to override this limit.',
      },
    ]);
  });

  it('should recognize a platform-prefixed unknown Claude model', async () => {
    const { warnings } = await platformFutureClaudeModel.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'us.anthropic.claude-future-9-20990101-v1:0',
      max_tokens: 128000,
    });
    expect(warnings).toContainEqual({
      type: 'compatibility',
      feature: 'maxOutputTokens',
      details:
        'The model "us.anthropic.claude-future-9-20990101-v1:0" is unknown. The max output tokens have been limited to 128000. Set maxOutputTokens explicitly to override this limit.',
    });
  });

  it('should strip unsupported sampling parameters for an unknown Claude model', async () => {
    const { warnings } = await futureClaudeModel.doGenerate({
      prompt: TEST_PROMPT,
      maxOutputTokens: 100,
      temperature: 0.5,
      topP: 0.7,
      topK: 10,
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.temperature).toBeUndefined();
    expect(requestBody.top_p).toBeUndefined();
    expect(requestBody.top_k).toBeUndefined();
    expect(warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'temperature',
        details:
          'temperature is not supported by claude-future-9 and will be ignored',
      },
      {
        type: 'unsupported',
        feature: 'topK',
        details: 'topK is not supported by claude-future-9 and will be ignored',
      },
      {
        type: 'unsupported',
        feature: 'topP',
        details: 'topP is not supported by claude-future-9 and will be ignored',
      },
    ]);
  });

  it('should use native structured output for an unknown Claude model', async () => {
    await futureClaudeModel.doGenerate({
      prompt: TEST_PROMPT,
      maxOutputTokens: 100,
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
          additionalProperties: false,
        },
      },
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.output_config?.format?.type).toBe('json_schema');
    expect(requestBody.tools).toBeUndefined();
    expect(requestBody.tool_choice).toBeUndefined();
  });

  it('should retain sampling parameters and JSON tool fallback for legacy Claude models', async () => {
    await legacyClaudeModel.doGenerate({
      prompt: TEST_PROMPT,
      maxOutputTokens: 100,
      temperature: 0.5,
      topK: 10,
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
          additionalProperties: false,
        },
      },
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.temperature).toBe(0.5);
    expect(requestBody.top_k).toBe(10);
    expect(requestBody.output_config).toBeUndefined();
    expect(requestBody.tools).toHaveLength(1);
    expect(requestBody.tools[0].name).toBe('json');
  });
});
