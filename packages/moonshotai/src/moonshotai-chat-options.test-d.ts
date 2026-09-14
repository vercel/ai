import { describe, expectTypeOf, it } from 'vitest';
import type { MoonshotAIProviderOptions } from './index';

describe('MoonshotAIProviderOptions', () => {
  it('exposes supported official and backwards-compatible option fields', () => {
    expectTypeOf<MoonshotAIProviderOptions>().toEqualTypeOf<{
      reasoningEffort?: 'low' | 'high' | 'max';
      prediction?: {
        type: 'content';
        content: string | Array<{ type: 'text'; text: string }>;
      };
      thinking?: {
        type?: 'enabled' | 'disabled';
        budgetTokens?: number;
      };
      reasoningHistory?: 'disabled' | 'interleaved' | 'preserved';
      strictJsonSchema?: boolean;
      logprobs?: boolean;
      topLogprobs?: number;
    }>();
  });

  it('exposes and constrains predicted output options', () => {
    type Prediction = NonNullable<MoonshotAIProviderOptions['prediction']>;

    const stringPrediction = {
      type: 'content',
      content: 'Hello, world!',
    } satisfies Prediction;

    const textPartPrediction = {
      type: 'content',
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: ', world!' },
      ],
    } satisfies Prediction;

    expectTypeOf(stringPrediction).toMatchTypeOf<Prediction>();
    expectTypeOf(textPartPrediction).toMatchTypeOf<Prediction>();

    const invalidPredictionType: MoonshotAIProviderOptions = {
      prediction: {
        // @ts-expect-error prediction type must be content
        type: 'text',
        content: 'Hello, world!',
      },
    };
    invalidPredictionType;

    const invalidPredictionPart: MoonshotAIProviderOptions = {
      prediction: {
        type: 'content',
        content: [
          {
            // @ts-expect-error prediction arrays only support text parts
            type: 'image',
            text: 'Hello, world!',
          },
        ],
      },
    };
    invalidPredictionPart;

    const invalidPredictionContent: MoonshotAIProviderOptions = {
      prediction: {
        type: 'content',
        // @ts-expect-error prediction content must be a string or text-part array
        content: 123,
      },
    };
    invalidPredictionContent;
  });

  it('rejects invalid logprobs options', () => {
    const invalidLogprobs: MoonshotAIProviderOptions = {
      // @ts-expect-error logprobs must be a boolean
      logprobs: 1,
    };
    const invalidTopLogprobs: MoonshotAIProviderOptions = {
      // @ts-expect-error topLogprobs must be a number
      topLogprobs: '1',
    };
    invalidLogprobs;
    invalidTopLogprobs;
  });

  it('rejects non-boolean strictJsonSchema values', () => {
    const invalidOptions: MoonshotAIProviderOptions = {
      // @ts-expect-error strictJsonSchema must be a boolean
      strictJsonSchema: 'false',
    };
    invalidOptions;
  });
});
