import { describe, expect, it, vi } from 'vitest';
import { createGmicloud } from './gmicloud-provider';

// Verbatim capture from api.gmi-serving.com/v1/chat/completions (2026-08).
const MAX_TOKENS_BODY =
  '{"error":{"message":"Backend request failed with status 400","type":"backend_error","code":400,"details":"{\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"code\\":\\"400001\\",\\"message\\":\\"The request is invalid: Invalid max_tokens value, the valid range of max_tokens is [1, 393216]. Please check the request body, required fields, and request format.\\",\\"message_zh\\":\\"请求不合法：Invalid max_tokens value, the valid range of max_tokens is [1, 393216]，请检查请求体、必填字段及请求格式是否正确。\\",\\"source\\":\\"client\\",\\"request_id\\":\\"6d6429ae-0ee8-49c1-9308-cbd2e2889b45\\"}}"}}';

describe('GmicloudChatLanguageModel error handling', () => {
  it('surfaces the engine diagnostic from error.details on a 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(MAX_TOKENS_BODY, {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'content-type': 'application/json' },
      }),
    );
    const model = createGmicloud({ apiKey: 'test-key', fetch: fetchMock })(
      'deepseek-ai/DeepSeek-V4-Flash-0731',
    );

    const error = await model
      .doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
        maxOutputTokens: 999999999,
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    expect((error as { name?: string }).name).toBe('AI_APICallError');
    expect((error as { statusCode?: number }).statusCode).toBe(400);
    expect((error as { message?: string }).message).toBe(
      'The request is invalid: Invalid max_tokens value, the valid range of max_tokens is [1, 393216]. Please check the request body, required fields, and request format.',
    );
  });
});
