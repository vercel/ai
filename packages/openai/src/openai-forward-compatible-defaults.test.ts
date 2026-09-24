import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createOpenAI } from './openai-provider';

const prompt: LanguageModelV4Prompt = [
  { role: 'system', content: 'Follow the instructions.' },
  { role: 'user', content: [{ type: 'text', text: 'Say ok.' }] },
];

const chatParameterError = readFixture(
  './chat/__fixtures__/reasoning-model-legacy-parameter-error.json',
);
const responsesTemperatureError = readFixture(
  './responses/__fixtures__/reasoning-model-temperature-error.json',
);
const imageResponseFormatError = readFixture(
  './image/__fixtures__/gpt-image-response-format-error.json',
);

function readFixture(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

function successfulChatResponse(model: string) {
  return {
    id: 'chatcmpl_test',
    object: 'chat.completion',
    created: 1,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'ok' },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    },
  };
}

function successfulResponsesResponse(model: string) {
  return {
    id: 'resp_test',
    object: 'response',
    created_at: 1,
    status: 'completed',
    model,
    output: [],
    usage: {
      input_tokens: 1,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 1,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 2,
    },
  };
}

describe('OpenAI forward-compatible model-family defaults', () => {
  it('uses reasoning-safe Chat Completions request defaults for gpt-99', async () => {
    const provider = createOpenAI({
      apiKey: 'test-api-key',
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        const isReasoningSafe =
          body.messages[0]?.role === 'developer' &&
          body.max_completion_tokens === 64 &&
          body.max_tokens == null &&
          body.temperature == null &&
          body.top_p == null &&
          body.frequency_penalty == null &&
          body.presence_penalty == null &&
          body.logit_bias == null &&
          body.logprobs == null;

        return isReasoningSafe
          ? Response.json(successfulChatResponse(body.model))
          : Response.json(chatParameterError, { status: 400 });
      },
    });

    await expect(
      provider.chat('gpt-99').doGenerate({
        prompt,
        maxOutputTokens: 64,
        temperature: 0.2,
        topP: 0.8,
        frequencyPenalty: 0.1,
        presencePenalty: 0.1,
        providerOptions: {
          openai: {
            logitBias: { '1': 1 },
            logprobs: 2,
          },
        },
      }),
    ).resolves.toBeDefined();
  });

  it('uses reasoning-safe Responses API request defaults for gpt-99', async () => {
    const provider = createOpenAI({
      apiKey: 'test-api-key',
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        const isReasoningSafe =
          body.input[0]?.role === 'developer' &&
          body.temperature == null &&
          body.top_p == null;

        return isReasoningSafe
          ? Response.json(successfulResponsesResponse(body.model))
          : Response.json(responsesTemperatureError, { status: 400 });
      },
    });

    await expect(
      provider.responses('gpt-99').doGenerate({
        prompt,
        temperature: 0.2,
        topP: 0.8,
        providerOptions: {
          openai: {
            reasoningEffort: 'medium',
          },
        },
      }),
    ).resolves.toBeDefined();
  });

  it('uses GPT Image family defaults for gpt-image-99', async () => {
    const provider = createOpenAI({
      apiKey: 'test-api-key',
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body));

        return body.response_format == null
          ? Response.json({
              created: 1,
              data: [{ b64_json: 'image' }, { b64_json: 'image' }],
            })
          : Response.json(imageResponseFormatError, { status: 400 });
      },
    });
    const model = provider.image('gpt-image-99');

    expect(model.maxImagesPerCall).toBe(10);
    await expect(
      model.doGenerate({
        prompt: 'A black square.',
        files: undefined,
        mask: undefined,
        n: 2,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        providerOptions: {},
      }),
    ).resolves.toBeDefined();
  });
});
