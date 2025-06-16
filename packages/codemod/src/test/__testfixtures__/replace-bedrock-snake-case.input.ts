// @ts-nocheck
import { generateText, streamText, generateObject } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';

// Basic reasoning_config example from the breaking change doc
export async function testBasicReasoningConfig() {
  const result = await generateText({
    model: bedrock('amazon.titan-tg1-large'),
    prompt: 'Hello, world!',
    providerOptions: {
      bedrock: {
        reasoning_config: {
          type: 'enabled',
          budgetTokens: 1024,
        },
      },
    },
  });
  return result;
}

// Test with additionalModelRequestFields containing snake_case
export async function testAdditionalModelRequestFields() {
  const result = await generateText({
    model: bedrock('anthropic.claude-3-sonnet-20240229-v1:0'),
    prompt: 'Analyze this data',
    providerOptions: {
      bedrock: {
        additional_model_request_fields: {
          some_custom_param: 'value',
          another_snake_case: true,
        },
      },
    },
  });
  return result;
}

// Test streaming with reasoning_config
export async function testStreamingWithReasoningConfig() {
  const result = await streamText({
    model: bedrock('us.anthropic.claude-3-7-sonnet-20250219-v1:0'),
    prompt: 'Generate a story',
    providerOptions: {
      bedrock: {
        reasoning_config: {
          type: 'enabled',
          budget_tokens: 2048,
        },
      },
    },
  });
  return result;
}

// Mixed with other providers (should not affect non-bedrock)
export async function testMixedProviders() {
  const result = await generateObject({
    model: bedrock('anthropic.claude-3-haiku-20240307-v1:0'),
    prompt: 'Create a user object',
    schema: { type: 'object' },
    providerOptions: {
      bedrock: {
        reasoning_config: {
          type: 'disabled',
        },
      },
      openai: {
        some_snake_case: 'should not change',
      },
    },
  });
  return result;
}
