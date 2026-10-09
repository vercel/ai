import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { defaultOpenAICompatibleErrorStructure } from './openai-compatible-error';

describe('defaultOpenAICompatibleErrorStructure', () => {
  const handler = createJsonErrorResponseHandler(
    defaultOpenAICompatibleErrorStructure,
  );
  const call = (error: Record<string, unknown>) =>
    handler({
      url: 'https://api.example.com/v1/chat/completions',
      requestBodyValues: {},
      response: new Response(JSON.stringify({ error }), { status: 400 }),
    });

  it('flags context_length_exceeded errors', async () => {
    const { value } = await call({
      message:
        "This model's maximum context length is 128000 tokens. However, your messages resulted in 130000 tokens.",
      code: 'context_length_exceeded',
    });

    expect(value.reason).toBe('context-length-exceeded');
  });

  it('does not flag other errors', async () => {
    const { value } = await call({
      message: 'Invalid model',
      code: 'model_not_found',
    });

    expect(value.reason).toBeUndefined();
  });
});
