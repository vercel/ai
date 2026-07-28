import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAnthropic } from './anthropic-provider';

const TEST_PROMPT: LanguageModelV4Prompt = [
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
});
