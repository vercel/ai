import { describe, expectTypeOf, it } from 'vitest';
import type {
  MoonshotAIAssistantMessageProviderOptions,
  MoonshotAILanguageModelOptions,
  MoonshotAISystemMessageProviderOptions,
} from './index';

describe('MoonshotAILanguageModelOptions', () => {
  it('exposes supported official and backwards-compatible option fields', () => {
    expectTypeOf<MoonshotAILanguageModelOptions>().toEqualTypeOf<{
      logprobs?: boolean;
      topLogprobs?: number;
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
      promptCacheKey?: string;
      safetyIdentifier?: string;
    }>();
  });

  it('exposes and constrains predicted output options', () => {
    type Prediction = NonNullable<MoonshotAILanguageModelOptions['prediction']>;

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

    const invalidPredictionType: MoonshotAILanguageModelOptions = {
      prediction: {
        // @ts-expect-error prediction type must be content
        type: 'text',
        content: 'Hello, world!',
      },
    };
    invalidPredictionType;

    const invalidPredictionPart: MoonshotAILanguageModelOptions = {
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

    const invalidPredictionContent: MoonshotAILanguageModelOptions = {
      prediction: {
        type: 'content',
        // @ts-expect-error prediction content must be a string or text-part array
        content: 123,
      },
    };
    invalidPredictionContent;
  });

  it('rejects non-boolean strictJsonSchema values', () => {
    const invalidOptions: MoonshotAILanguageModelOptions = {
      // @ts-expect-error strictJsonSchema must be a boolean
      strictJsonSchema: 'false',
    };
    invalidOptions;
  });
});

describe('MoonshotAIAssistantMessageProviderOptions', () => {
  it('accepts participant names and Partial Mode', () => {
    const options = {
      name: 'writer',
      partial: true,
    } satisfies MoonshotAIAssistantMessageProviderOptions;

    expectTypeOf(options.partial).toEqualTypeOf<true>();
  });

  it('rejects partial false', () => {
    const options = {
      // @ts-expect-error Moonshot AI only supports enabling Partial Mode
      partial: false,
    } satisfies MoonshotAIAssistantMessageProviderOptions;

    expectTypeOf(options.partial).toEqualTypeOf<false>();
  });
});

describe('MoonshotAISystemMessageProviderOptions', () => {
  it('exposes names and complete dynamic function tools', () => {
    expectTypeOf<MoonshotAISystemMessageProviderOptions>().toMatchTypeOf<{
      name?: string;
      tools?: Array<{
        type: 'function';
        name: string;
        description?: string;
        inputSchema: object;
        strict?: boolean;
      }>;
    }>();
  });
});
