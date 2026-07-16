import { describe, expect, it } from 'vitest';
import { formatBedrockModelId } from './format-bedrock-model-id';

describe('formatBedrockModelId', () => {
  it('encodes standard model IDs as one path segment', () => {
    expect(formatBedrockModelId('us.amazon.nova-2-lite-v1:0')).toBe(
      'us.amazon.nova-2-lite-v1%3A0',
    );
  });

  it('preserves ARN delimiters for application inference profile model IDs', () => {
    expect(
      formatBedrockModelId(
        'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123xyz',
      ),
    ).toBe(
      'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123xyz',
    );
  });

  it('still encodes unsafe characters in Bedrock ARN model IDs', () => {
    expect(
      formatBedrockModelId(
        'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc 123',
      ),
    ).toBe(
      'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc%20123',
    );
  });
});
