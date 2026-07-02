import { describe, expect, it } from 'vitest';
import { encodeBedrockModelId } from './amazon-bedrock-encode-model-id';

describe('encodeBedrockModelId', () => {
  it('URL-encodes regular model IDs containing colons', () => {
    expect(encodeBedrockModelId('us.amazon.nova-2-lite-v1:0')).toBe(
      'us.amazon.nova-2-lite-v1%3A0',
    );
  });

  it('returns application-inference-profile ARNs unencoded', () => {
    const arn =
      'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123';
    expect(encodeBedrockModelId(arn)).toBe(arn);
  });

  it('returns cross-region inference-profile ARNs unencoded', () => {
    const arn =
      'arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.amazon.nova-2-lite-v1:0';
    expect(encodeBedrockModelId(arn)).toBe(arn);
  });
});
