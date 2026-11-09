import { describe, expect, it } from 'vitest';
import { supportsClaude5NativeStructuredOutput } from './bedrock-anthropic-model-support';

describe('Claude 5 native structured output support', () => {
  it.each([
    'anthropic.claude-opus-5',
    'us.anthropic.claude-opus-5-v1:0',
    'anthropic.claude-sonnet-5',
    'anthropic.claude-sonnet-5-5',
    'eu.anthropic.claude-haiku-5-5-20261001-v1:0',
  ])('supports %s', modelId =>
    expect(supportsClaude5NativeStructuredOutput(modelId)).toBe(true),
  );
  it.each([
    'anthropic.claude-fable-5',
    'anthropic.claude-fable-5-2',
    'anthropic.claude-sonnet-4-6',
    'anthropic.claude-opus-5-9',
    'anthropic.claude-sonnet-5-60',
    'anthropic.claude-haiku-5-5-preview',
  ])('keeps %s on the existing policy', modelId =>
    expect(supportsClaude5NativeStructuredOutput(modelId)).toBe(false),
  );
});
