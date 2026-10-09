import { expect, it } from 'vitest';
import {
  supportsNativeStructuredOutput,
  supportsStrictTools,
} from './bedrock-anthropic-model-support';

it.each([
  ['anthropic.claude-3-7-sonnet-20250219-v1:0', true, true],
  ['anthropic.claude-sonnet-4-20250514-v1:0', true, true],
  ['us.anthropic.claude-opus-4-1-20250805-v1:0', true, true],
  ['anthropic.claude-sonnet-4-5-20250929-v1:0', true, true],
  ['anthropic.claude-opus-4-6-v1', true, true],
  ['anthropic.claude-sonnet-4-6-v1', false, true],
  ['anthropic.claude-haiku-4-5-20251001-v1:0', false, true],
  ['anthropic.claude-opus-4-7', false, false],
  ['anthropic.claude-opus-5', false, false],
  ['anthropic.claude-sonnet-5-5', false, false],
  ['us.anthropic.claude-opus-6-v1:0', false, false],
  ['global.anthropic.claude-future-v1:0', false, false],
  ['anthropic.claude-opus-4-60-v1', false, false],
  ['meta.llama3-70b-instruct-v1:0', true, true],
  [
    'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/custom',
    true,
    true,
  ],
])('preserves Bedrock capabilities for %s', (modelId, native, strict) => {
  expect(supportsNativeStructuredOutput(modelId as string)).toBe(native);
  expect(supportsStrictTools(modelId as string)).toBe(strict);
});
