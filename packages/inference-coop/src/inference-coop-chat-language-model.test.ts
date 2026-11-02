import { describe, expect, it, vi } from 'vitest';
import { createInferenceCoop } from './inference-coop-provider';

// Verbatim capture from gateway.inference.coop/v1/chat/completions (2026-11),
// responding to a request with an unknown model name.
const INVALID_MODEL_BODY =
  '{"error":{"message":"/chat/completions: Invalid model name passed in model=nonexistent/model. Call `/v1/models` to view available models for your key.","type":"invalid_request_error","param":null,"code":"400","provider_specific_fields":{"error":"/chat/completions: Invalid model name passed in model=nonexistent/model. Call `/v1/models` to view available models for your key."}}}';

describe('InferenceCoopChatLanguageModel error handling', () => {
  it('surfaces the gateway error message on a 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(INVALID_MODEL_BODY, {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'content-type': 'application/json' },
      }),
    );
    const model = createInferenceCoop({ apiKey: 'test-key', fetch: fetchMock })(
      'greenpt/deepseek-v4.1-flash',
    );

    const error = await model
      .doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );

    expect((error as { name?: string }).name).toBe('AI_APICallError');
    expect((error as { statusCode?: number }).statusCode).toBe(400);
    expect((error as { message?: string }).message).toBe(
      '/chat/completions: Invalid model name passed in model=nonexistent/model. Call `/v1/models` to view available models for your key.',
    );
  });
});
