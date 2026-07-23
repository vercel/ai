import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createOpenAI } from './openai-provider';

const prompt = [
  { role: 'system' as const, content: 'Be concise.' },
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Reply OK.' }],
  },
];

function fixture(path: string) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

describe('OpenAI forward-compatible defaults', () => {
  it('keeps future GPT sampling parameters and priority processing', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const provider = createOpenAI({
      apiKey: 'test-key',
      fetch: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return Response.json({
          id: 'resp_test',
          object: 'response',
          created_at: 0,
          status: 'completed',
          error: null,
          incomplete_details: null,
          instructions: null,
          max_output_tokens: null,
          model: 'gpt-5.7',
          output: [],
          parallel_tool_calls: true,
          previous_response_id: null,
          reasoning: { effort: 'none', summary: null },
          store: true,
          temperature: 0.2,
          text: { format: { type: 'text' } },
          tool_choice: 'auto',
          tools: [],
          top_p: 0.8,
          truncation: 'disabled',
          usage: {
            input_tokens: 1,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens: 1,
            output_tokens_details: { reasoning_tokens: 0 },
            total_tokens: 2,
          },
          metadata: {},
        });
      },
    });

    await provider.responses('gpt-5.7').doGenerate({
      prompt,
      temperature: 0.2,
      topP: 0.8,
      providerOptions: {
        openai: {
          reasoningEffort: 'none',
          serviceTier: 'priority',
        },
      },
    });

    expect(
      fixture(
        'src/responses/__fixtures__/openai-forward-compatible-defaults-temperature-error.1.json',
      ).error.param,
    ).toBe('temperature');
    expect(requestBody).toMatchObject({
      temperature: 0.2,
      top_p: 0.8,
      service_tier: 'priority',
    });
  });

  it('keeps future GPT Image family request defaults', async () => {
    const responseFormatError = fixture(
      'src/image/__fixtures__/openai-forward-compatible-defaults-response-format-error.1.json',
    );
    const provider = createOpenAI({
      apiKey: 'test-key',
      fetch: async (_input, init) => {
        const requestBody = JSON.parse(String(init?.body));
        return requestBody.response_format == null
          ? Response.json({
              created: 0,
              data: [{ b64_json: 'aW1hZ2U=' }],
            })
          : Response.json(responseFormatError, { status: 400 });
      },
    });

    const model = provider.image('gpt-image-3');

    await expect(
      model.doGenerate({
        prompt: 'A red dot',
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      }),
    ).resolves.toBeDefined();
    expect(model.maxImagesPerCall).toBe(10);
  });

  it('uses reasoning-safe chat request fields for future major versions', async () => {
    const maxTokensError = fixture(
      'src/chat/__fixtures__/openai-forward-compatible-defaults-max-tokens-error.1.json',
    );
    let requestBody: Record<string, unknown> | undefined;
    const provider = createOpenAI({
      apiKey: 'test-key',
      fetch: async (_input, init) => {
        const parsedRequestBody = JSON.parse(String(init?.body));
        requestBody = parsedRequestBody;
        return parsedRequestBody.max_tokens == null
          ? Response.json({
              id: 'chatcmpl-test',
              object: 'chat.completion',
              created: 0,
              model: 'gpt-6',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'ok' },
                  finish_reason: 'stop',
                },
              ],
            })
          : Response.json(maxTokensError, { status: 400 });
      },
    });

    await provider.chat('gpt-6').doGenerate({
      prompt,
      maxOutputTokens: 16,
      temperature: 0.2,
      providerOptions: {
        openai: {
          serviceTier: 'priority',
        },
      },
    });

    expect(requestBody).toMatchObject({
      max_completion_tokens: 16,
      service_tier: 'priority',
    });
    expect(requestBody).not.toHaveProperty('max_tokens');
    expect(requestBody).not.toHaveProperty('temperature');
  });
});
