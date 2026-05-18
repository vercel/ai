import { APICallError } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { createCerebras } from './cerebras-provider';

const TEST_PROMPT = [
  { role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] },
];

describe('cerebras error envelope parsing', () => {
  it('parses a Cerebras 500 error body without TypeValidationError (fixes #11783)', async () => {
    // Exact response body shape returned by Cerebras for an upstream 500.
    // The previous error schema expected `{ message, type, param, code }` at
    // the top level, which threw `TypeValidationError` instead of surfacing
    // the API error.
    const cerebrasErrorBody = {
      status_code: 500,
      error: {
        message: 'Encountered a server error, please try again.',
        type: 'server_error',
        param: '',
        code: '',
        id: '',
      },
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(cerebrasErrorBody), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const cerebras = createCerebras({
      apiKey: 'test',
      fetch: fetchMock,
    });

    await expect(
      cerebras('zai-glm-4.7').doGenerate({ prompt: TEST_PROMPT }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(APICallError.isInstance(error)).toBe(true);
      expect((error as APICallError).message).toBe(
        'Encountered a server error, please try again.',
      );
      return true;
    });
  });

  it('tolerates a 400 with `code` returned as a number', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'Bad request',
            type: 'invalid_request_error',
            code: 400,
          },
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const cerebras = createCerebras({
      apiKey: 'test',
      fetch: fetchMock,
    });

    await expect(
      cerebras('zai-glm-4.7').doGenerate({ prompt: TEST_PROMPT }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(APICallError.isInstance(error)).toBe(true);
      expect((error as APICallError).message).toBe('Bad request');
      return true;
    });
  });
});
